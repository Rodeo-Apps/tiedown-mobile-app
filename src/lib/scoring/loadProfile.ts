// src/lib/scoring/loadProfile.ts
//
// Resolve a dated RulesProfile from the shared Supabase rule versioning tables
// (rule_sets + rule_set_entries), so the scoring engines can be fed real,
// citable rule values instead of hardcoded guesses.
//
// A run must be scored under the rules in force on the day it happened, so the
// caller passes the date of the run (defaulting to today) and this resolves the
// rule set whose effective window covers it.

import { supabase } from '@/lib/supabase';
import type { RulesProfile } from './types.ts';

/** YYYY-MM-DD for the given date (defaults to today), used for effective-window matching. */
function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Load the rules profile for an association + event on a given date.
 *
 * Returns null if no rule set is seeded for that association/date — callers
 * must handle that (refuse to score rather than guess).
 */
export async function loadRulesProfile(
  associationCode: string,
  eventType: string,
  on: string = isoDate(),
): Promise<RulesProfile | null> {
  // Most recent rule set whose effective window covers `on`.
  const { data: ruleSet, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, association_code, edition_label, effective_from, effective_to')
    .eq('association_code', associationCode)
    .lte('effective_from', on)
    .or(`effective_to.is.null,effective_to.gte.${on}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rsErr || !ruleSet) return null;

  const { data: entries, error: eErr } = await supabase
    .from('rule_set_entries')
    .select('rule_key, value')
    .eq('rule_set_id', ruleSet.id)
    .eq('event_type', eventType);

  if (eErr) return null;

  const values: Record<string, unknown> = {};
  for (const row of entries ?? []) {
    values[row.rule_key as string] = (row as { value: unknown }).value;
  }

  return {
    ruleSetId: ruleSet.id as string,
    edition: ruleSet.edition_label as string,
    associationCode: ruleSet.association_code as string,
    values,
  };
}
