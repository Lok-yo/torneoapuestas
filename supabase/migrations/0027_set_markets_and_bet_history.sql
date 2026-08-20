-- 0027: Match markets keyed by start.gg set + system auto-resolve.
-- Lets any authenticated user open a betting line on a TOP-8 set with
-- player names as outcomes, and settles it from the ingested result.

alter table public.markets
  add column if not exists startgg_set_id bigint check (startgg_set_id > 0);

create unique index if not exists markets_live_set_uniq
  on public.markets (tournament_id, startgg_set_id)
  where startgg_set_id is not null and status in ('OPEN', 'SUSPENDED');

-- Internal settlement used by ensure_* (SECURITY DEFINER, not granted to clients).
create or replace function public._settle_market(p_market_id uuid, p_winning_outcome_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_market public.markets%rowtype;
  v_outcome public.market_outcomes%rowtype;
  v_pos record;
  v_payout numeric(12, 2);
begin
  select * into v_market from public.markets where id = p_market_id for update;
  if not found or v_market.status = 'RESOLVED' then
    return;
  end if;

  select * into v_outcome
  from public.market_outcomes
  where id = p_winning_outcome_id and market_id = p_market_id;
  if not found then
    return;
  end if;

  update public.markets
  set status = 'RESOLVED',
      resolution_outcome_id = p_winning_outcome_id,
      resolved_at = now(),
      updated_at = now()
  where id = p_market_id;

  for v_pos in
    select user_id, shares
    from public.market_positions
    where outcome_id = p_winning_outcome_id and shares > 0
  loop
    v_payout := round(v_pos.shares * 1.00, 2);
    update public.wallets
    set balance = public.wallets.balance + v_payout,
        updated_at = now()
    where user_id = v_pos.user_id;

    insert into public.wallet_transactions (user_id, amount, type, status, reference_id, description)
    values (
      v_pos.user_id,
      v_payout,
      'BET_PAYOUT',
      'COMPLETED',
      p_market_id::text,
      'Ganancia por ' || v_outcome.label || ' en: ' || v_market.question
    );
  end loop;
end;
$$;

create or replace function public.ensure_set_market(
  p_tournament_id uuid,
  p_startgg_set_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_set public.tournament_sets%rowtype;
  v_market public.markets%rowtype;
  v_a text;
  v_b text;
  v_winner text;
  v_win_id uuid;
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: Ingresá con tu cuenta para apostar'
      using errcode = '42501';
  end if;

  if p_tournament_id is null or p_startgg_set_id is null or p_startgg_set_id <= 0 then
    raise exception 'VALIDATION_ERROR: tournament_id y startgg_set_id son requeridos'
      using errcode = '22023';
  end if;

  select * into v_set
  from public.tournament_sets
  where tournament_id = p_tournament_id and startgg_set_id = p_startgg_set_id;

  if not found then
    raise exception 'NOT_FOUND: Ese set no existe en este torneo' using errcode = 'P0002';
  end if;

  v_a := nullif(trim(coalesce(v_set.entrant_a_name, '')), '');
  v_b := nullif(trim(coalesce(v_set.entrant_b_name, '')), '');
  if v_a is null or v_b is null then
    raise exception 'UNPROCESSABLE: El set todavía no tiene ambos jugadores'
      using errcode = '22003';
  end if;

  select * into v_market
  from public.markets
  where tournament_id = p_tournament_id
    and startgg_set_id = p_startgg_set_id
  order by created_at desc
  limit 1
  for update;

  if not found then
    begin
      insert into public.markets (tournament_id, question, category, status, created_by, startgg_set_id)
      values (p_tournament_id, v_a || ' vs ' || v_b, 'MATCH', 'OPEN', v_user_id, p_startgg_set_id)
      returning * into v_market;

      insert into public.market_outcomes (market_id, label, price)
      values (v_market.id, v_a, 0.5000), (v_market.id, v_b, 0.5000);
    exception
      when unique_violation then
        select * into v_market
        from public.markets
        where tournament_id = p_tournament_id and startgg_set_id = p_startgg_set_id
        order by created_at desc
        limit 1;
    end;
  end if;

  if v_market.status = 'OPEN' and v_set.state = 'COMPLETED' then
    v_winner := case
      when v_set.winner_startgg_id = v_set.entrant_a_startgg_id then v_a
      when v_set.winner_startgg_id = v_set.entrant_b_startgg_id then v_b
      else null
    end;
    if v_winner is not null then
      select id into v_win_id
      from public.market_outcomes
      where market_id = v_market.id and label = v_winner
      limit 1;
      if v_win_id is not null then
        perform public._settle_market(v_market.id, v_win_id);
        select * into v_market from public.markets where id = v_market.id;
      end if;
    end if;
  end if;

  select jsonb_build_object(
    'id', m.id,
    'tournament_id', m.tournament_id,
    'startgg_set_id', m.startgg_set_id,
    'question', m.question,
    'category', m.category,
    'status', m.status,
    'resolution_outcome_id', m.resolution_outcome_id,
    'created_at', m.created_at,
    'market_outcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'label', o.label,
        'price', o.price,
        'total_shares', o.total_shares
      ) order by o.created_at)
      from public.market_outcomes o
      where o.market_id = m.id
    ), '[]'::jsonb)
  )
  into v_payload
  from public.markets m
  where m.id = v_market.id;

  return v_payload;
end;
$$;

create or replace function public.ensure_tournament_set_markets(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row record;
  v_acc jsonb := '[]'::jsonb;
  v_market jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: Ingresá con tu cuenta para apostar'
      using errcode = '42501';
  end if;

  if p_tournament_id is null then
    raise exception 'VALIDATION_ERROR: tournament_id es requerido'
      using errcode = '22023';
  end if;

  for v_row in
    select startgg_set_id
    from public.tournament_sets
    where tournament_id = p_tournament_id
      and entrant_a_name is not null
      and entrant_b_name is not null
      and trim(entrant_a_name) <> ''
      and trim(entrant_b_name) <> ''
    order by round, slot
  loop
    v_market := public.ensure_set_market(p_tournament_id, v_row.startgg_set_id);
    v_acc := v_acc || jsonb_build_array(v_market);
  end loop;

  return v_acc;
end;
$$;

revoke all on function public._settle_market(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_set_market(uuid, bigint) to authenticated;
grant execute on function public.ensure_tournament_set_markets(uuid) to authenticated;
