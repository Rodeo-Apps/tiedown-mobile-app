-- 003 rule_sets scoring seed for tiedown-mobile-app
--
-- Seeds the shared Rodeo Apps rule versioning tables (created in migration 001)
-- with the WPRA/PRCA/WRCA 2026 rule sets so the tie-down roping scoring
-- engine can resolve real, dated, citable barrier penalties instead of guessing.
-- Every rule is DATA and every outcome cites its rule (src/lib/scoring/types.ts).
--
-- Idempotent: safe to run more than once.

begin;

-- WPRA 2026 (breakaway roping)
insert into public.rule_sets (association_code, edition_label, source_url, effective_from, effective_to, revision_date, verified_by, verified_at, notes)
select 'WPRA', 'WPRA 2026', 'https://www.wpra.com/', date '2026-01-01', null, date '2025-10-01', 'seed', now(),
       'WPRA rolling rulebook, amendments through 1 Oct 2025.'
where not exists (select 1 from public.rule_sets where association_code='WPRA' and edition_label='WPRA 2026');

-- PRCA 2026 Rule Book
insert into public.rule_sets (association_code, edition_label, source_url, effective_from, effective_to, revision_date, verified_by, verified_at, notes)
select 'PRCA', 'PRCA 2026 Rule Book', 'https://www.prorodeo.com/', date '2026-01-01', null, date '2025-10-01', 'seed', now(),
       'PRCA 2026 Rule Book. Parts 9 and 10 not yet diffed against the 2026 addendum.'
where not exists (select 1 from public.rule_sets where association_code='PRCA' and edition_label='PRCA 2026 Rule Book');

-- WRCA 2026 (ranch rodeo)
insert into public.rule_sets (association_code, edition_label, source_url, effective_from, effective_to, revision_date, verified_by, verified_at, notes)
select 'WRCA', 'WRCA 2026', 'https://www.wrca.org/', date '2026-01-01', null, date '2025-10-01', 'seed', now(),
       'WRCA sanctioned ranch rodeo pattern.'
where not exists (select 1 from public.rule_sets where association_code='WRCA' and edition_label='WRCA 2026');

-- WPRA breakaway entries
insert into public.rule_set_entries (rule_set_id, event_type, rule_key, value, citation)
select s.id, v.event_type, v.rule_key, v.value::jsonb, v.citation
from public.rule_sets s
join (values
  ('breakaway', 'barrier_penalty_seconds', '10.0', 'WPRA 2026 — 10 second barrier penalty'),
  ('breakaway', 'strict_flag_review',      'false', 'WPRA 2026 — standard flag review')
) as v(event_type, rule_key, value, citation) on true
where s.association_code='WPRA' and s.edition_label='WPRA 2026'
on conflict (rule_set_id, event_type, rule_key) do update set value=excluded.value, citation=excluded.citation;

-- PRCA entries (timed + roughstock)
insert into public.rule_set_entries (rule_set_id, event_type, rule_key, value, citation)
select s.id, v.event_type, v.rule_key, v.value::jsonb, v.citation
from public.rule_sets s
join (values
  ('breakaway',      'barrier_penalty_seconds',     '10.0',           'PRCA 2026 — 10 second barrier penalty'),
  ('breakaway',      'strict_flag_review',          'false',          'PRCA 2026 — standard flag review'),
  ('tiedown',        'barrier_seconds',             '10',             'PRCA 2026 — 10 second barrier penalty'),
  ('tiedown',        'time_limit_seconds',          '30',             'PRCA 2026 — arena time limit'),
  ('tiedown',        'loops',                       '1',              'PRCA 2026 — one loop'),
  ('tiedown',        'jerk_down_disqualifies',      'true',           'PRCA 2026 — jerk-down rule enforced'),
  ('steer_wrestling','barrier_seconds',             '10',             'PRCA 2026 — 10 second barrier penalty'),
  ('steer_wrestling','time_limit_seconds',          '30',             'PRCA 2026 — arena time limit'),
  ('steer_wrestling','hazer_interference_no_times', 'true',           'PRCA 2026 — hazer interference is a no time'),
  ('team_roping',    'barrier_seconds',             '10',             'PRCA 2026 — 10 second barrier penalty'),
  ('team_roping',    'one_hind_foot_seconds',       '5',              'PRCA 2026 — 5 second one-hind-foot penalty'),
  ('team_roping',    'standard',                    '"loop_release"', 'PRCA 2026 — loop released timing standard'),
  ('team_roping',    'finish_mode',                 '"face"',         'PRCA 2026 — both horses must face'),
  ('bareback',       'judge_count',                 '2',              'PRCA 2026 — two judges'),
  ('bareback',       'judge_component_max',         '25',             'PRCA 2026 — 0-25 per component'),
  ('bareback',       'mark_out_treatment',          '"disqualify"',   'PRCA 2026 — failure to mark out disqualifies'),
  ('saddle_bronc',   'judge_count',                 '2',              'PRCA 2026 — two judges'),
  ('saddle_bronc',   'judge_component_max',         '25',             'PRCA 2026 — 0-25 per component'),
  ('saddle_bronc',   'mark_out_treatment',          '"disqualify"',   'PRCA 2026 — failure to mark out disqualifies'),
  ('bull_riding',    'judge_count',                 '2',              'PRCA 2026 — two judges'),
  ('bull_riding',    'judge_component_max',         '25',             'PRCA 2026 — 0-25 per component')
) as v(event_type, rule_key, value, citation) on true
where s.association_code='PRCA' and s.edition_label='PRCA 2026 Rule Book'
on conflict (rule_set_id, event_type, rule_key) do update set value=excluded.value, citation=excluded.citation;

-- WRCA ranch rodeo entries
insert into public.rule_set_entries (rule_set_id, event_type, rule_key, value, citation)
select s.id, v.event_type, v.rule_key, v.value::jsonb, v.citation
from public.rule_sets s
join (values
  ('ranch_rodeo', 'event_time_limit_seconds', '120', 'WRCA 2026 — two minute event limit')
) as v(event_type, rule_key, value, citation) on true
where s.association_code='WRCA' and s.edition_label='WRCA 2026'
on conflict (rule_set_id, event_type, rule_key) do update set value=excluded.value, citation=excluded.citation;

commit;
