-- 0001_roles_and_grants.sql
-- Roles exist only as database grants (public.user_roles), never as a
-- client/JWT-supplied claim. Every new auth user is granted the 'user'
-- role by default via trigger. See design.md "Browser writes vs commands".

create type public.app_role as enum ('user', 'organizer', 'referee', 'admin');

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_user_id_idx on public.user_roles (user_id);

comment on table public.user_roles is
  'Server-owned role grants. Roles are authorized from this table only, never from client/JWT claims.';

-- Default role: every new auth user gets 'user' automatically.
create or replace function public.handle_new_user_default_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_default_role
  after insert on auth.users
  for each row execute function public.handle_new_user_default_role();

-- Helper used by RLS policies and RPCs to check role grants server-side.
create or replace function public.has_role(check_role public.app_role, check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = check_user and role = check_role
  );
$$;

grant execute on function public.has_role(public.app_role, uuid) to authenticated, anon;
