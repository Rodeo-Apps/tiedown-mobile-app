-- 007_fix_tiedown_runs_scoring_columns.sql for tiedown-mobile-app
--
-- The Compete screen writes the tie-down scoring engine's output (raw/official
-- times, catch flags, rule_set_id, status) to tiedown_runs, but no earlier
-- migration added those columns. This adds them idempotently so inserts succeed.

begin;

alter table public.tiedown_runs add column if not exists rule_set_id uuid references public.rule_sets(id);
alter table public.tiedown_runs add column if not exists status text;
alter table public.tiedown_runs add column if not exists raw_time_ms integer;
alter table public.tiedown_runs add column if not exists official_time_ms integer;
alter table public.tiedown_runs add column if not exists catch_ok boolean;
alter table public.tiedown_runs add column if not exists calf_thrown_by_hand boolean;
alter table public.tiedown_runs add column if not exists legs_tied integer;
alter table public.tiedown_runs add column if not exists wrap_and_hooey boolean;
alter table public.tiedown_runs add column if not exists loops_thrown integer;
alter table public.tiedown_runs add column if not exists jerk_down boolean;

commit;
