-- 0004_rls_policies.sql
-- Deny-by-default row-level security AND deny-by-default table grants on
-- every table introduced in 0001-0003. The `public` schema's default
-- privileges grant anon/authenticated full CRUD on new tables; this
-- migration revokes that first, then grants back only what each table
-- actually needs, and finally layers RLS policies for row-level scoping.
-- Two independent gates (grants + RLS) is deliberate defense-in-depth.
--
-- Writes to tournaments/memberships/brackets/matches/results/
-- rating_events/rating_snapshots/user_roles happen only through
-- SECURITY DEFINER RPCs owned by the table owner, which bypass RLS and
-- do not need anon/authenticated table grants at all. Public reads go
-- through the allowlisted views in 0005_public_views.sql, not these
-- base tables. See platform-foundation spec "Least-privilege data
-- access" and design.md "Public views allowlist competitive fields".

revoke all on
  public.user_roles,
  public.profiles,
  public.games,
  public.tournament_formats,
  public.tournaments,
  public.memberships,
  public.brackets,
  public.matches,
  public.results,
  public.rating_events,
  public.rating_snapshots,
  public.audit_events,
  public.command_outcomes
from anon, authenticated;

-- ---------------------------------------------------------------------
-- user_roles: self can read own grants; admin can read all. No client
-- writes; grants are issued only by security-definer functions/
-- migrations running as the table owner.
-- ---------------------------------------------------------------------

alter table public.user_roles enable row level security;
grant select on public.user_roles to authenticated;

create policy user_roles_select_self on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid());

create policy user_roles_select_admin on public.user_roles
  for select
  to authenticated
  using (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- profiles: owner reads/updates/inserts own row. Other authenticated
-- users read only via public_* views (0005), never this table.
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

create policy profiles_select_self on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create policy profiles_update_self on public.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy profiles_insert_self on public.profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- games / tournament_formats: public read-only catalog data. Writes
-- are admin-only (Stage 1 seeds one row via migration; this policy
-- exists for future maintainer operations, not client writes).
-- ---------------------------------------------------------------------

alter table public.games enable row level security;
grant select on public.games to anon, authenticated;
grant insert, update, delete on public.games to authenticated;

create policy games_select_all on public.games
  for select
  to anon, authenticated
  using (true);

create policy games_write_admin on public.games
  for all
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

alter table public.tournament_formats enable row level security;
grant select on public.tournament_formats to anon, authenticated;
grant insert, update, delete on public.tournament_formats to authenticated;

create policy tournament_formats_select_all on public.tournament_formats
  for select
  to anon, authenticated
  using (true);

create policy tournament_formats_write_admin on public.tournament_formats
  for all
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- tournaments: organizer manages own tournaments directly (draft
-- editing); everyone can read published (non-DRAFT) tournaments.
-- Lifecycle transitions still go through advance_tournament_state
-- (0008) for audit/versioning even though organizers hold table grants.
-- ---------------------------------------------------------------------

alter table public.tournaments enable row level security;
grant select, insert, update on public.tournaments to authenticated;
grant select on public.tournaments to anon;

create policy tournaments_select_organizer on public.tournaments
  for select
  to authenticated
  using (organizer_id = auth.uid());

create policy tournaments_select_published on public.tournaments
  for select
  to anon, authenticated
  using (status <> 'DRAFT');

create policy tournaments_write_organizer on public.tournaments
  for all
  to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

create policy tournaments_write_admin on public.tournaments
  for all
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- memberships: participants read their own membership; organizer reads
-- memberships for tournaments they own. No direct client writes —
-- registration/withdrawal only via register_participant/
-- withdraw_participant RPCs (0009), which enforce eligibility,
-- uniqueness, and freeze rules server-side.
-- ---------------------------------------------------------------------

alter table public.memberships enable row level security;
grant select on public.memberships to authenticated;

create policy memberships_select_self on public.memberships
  for select
  to authenticated
  using (user_id = auth.uid());

create policy memberships_select_organizer on public.memberships
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = memberships.tournament_id
        and t.organizer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- brackets / matches: readable by the tournament organizer and by
-- registered participants. No direct client writes — bracket
-- generation only via generate_bracket RPC (0010). Public reads go
-- through public_brackets_view (0005) only, never these base tables —
-- see that view's definer-privilege note for why it does not need (and
-- deliberately does not get) an anon grant here.
-- ---------------------------------------------------------------------

alter table public.brackets enable row level security;
grant select on public.brackets to authenticated;

create policy brackets_select_involved on public.brackets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = brackets.tournament_id
        and (
          t.organizer_id = auth.uid()
          or exists (
            select 1 from public.memberships m
            where m.tournament_id = t.id and m.user_id = auth.uid()
          )
        )
    )
  );

alter table public.matches enable row level security;
grant select on public.matches to authenticated;

create policy matches_select_involved on public.matches
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = matches.tournament_id
        and (
          t.organizer_id = auth.uid()
          or exists (
            select 1 from public.memberships m
            where m.tournament_id = t.id and m.user_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------
-- results: organizer/referee for the owning tournament, and the
-- participants in the match, can read. No direct client writes —
-- only submit_official_result / correct_result RPCs (0011, 0013).
-- Public reads go through public_brackets_view (0005) only.
-- ---------------------------------------------------------------------

alter table public.results enable row level security;
grant select on public.results to authenticated;

create policy results_select_involved on public.results
  for select
  to authenticated
  using (
    exists (
      select 1 from public.matches mt
      join public.tournaments t on t.id = mt.tournament_id
      where mt.id = results.match_id
        and (
          t.organizer_id = auth.uid()
          or public.has_role('referee')
          or exists (
            select 1 from public.memberships m
            where m.id in (mt.participant_a_membership_id, mt.participant_b_membership_id)
              and m.user_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------
-- rating_events / rating_snapshots: private detail is admin-only.
-- Public reads go through public_leaderboard_view /
-- public_player_history_view (0005). No direct client writes — only
-- the rating projector trigger/RPC (0012) and correct_result (0013).
-- ---------------------------------------------------------------------

alter table public.rating_events enable row level security;
grant select on public.rating_events to authenticated;

create policy rating_events_select_admin on public.rating_events
  for select
  to authenticated
  using (public.has_role('admin'));

alter table public.rating_snapshots enable row level security;
grant select on public.rating_snapshots to authenticated;

create policy rating_snapshots_select_admin on public.rating_snapshots
  for select
  to authenticated
  using (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- audit_events: admin-only read; append-only. No update/delete grant
-- to any client role exists, and no update/delete policy exists
-- either, so the audit trail cannot be altered post-hoc.
-- ---------------------------------------------------------------------

alter table public.audit_events enable row level security;
grant select on public.audit_events to authenticated;

create policy audit_events_select_admin on public.audit_events
  for select
  to authenticated
  using (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- command_outcomes: never exposed to ordinary clients. Only
-- security-definer RPCs read/write it (as the table owner, bypassing
-- RLS). No grants and zero policies for anon/authenticated.
-- ---------------------------------------------------------------------

alter table public.command_outcomes enable row level security;
