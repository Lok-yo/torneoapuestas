-- pgTAP: 0027 set markets. Requires a tournament_sets row (created in this file).

begin;
select plan(3);

select has_function('public', 'ensure_set_market', array['uuid', 'bigint'], 'ensure_set_market exists');
select has_function('public', 'ensure_tournament_set_markets', array['uuid'], 'ensure_tournament_set_markets exists');
select has_column('public', 'markets', 'startgg_set_id', 'markets.startgg_set_id exists');

select * from finish();
rollback;
