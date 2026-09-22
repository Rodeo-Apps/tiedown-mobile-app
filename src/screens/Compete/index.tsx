import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { colors, spacing, radius } from '@/constants/theme';
import { scoreTieDownRun, loadRulesProfile, formatTime } from '@/lib/scoring';

// Tie-down roping is scored under the PRCA rule book.
const ASSOCIATION_CODE = 'PRCA';
const EVENT_TYPE = 'tiedown';

type Run = {
  id: string;
  created_at: string;
  raw_time_ms: number | null;
  official_time_ms: number | null;
  total_time: number | string | null;
  barrier_broken: boolean | null;
  tie_held: boolean | null;
  status: string | null;
  notes: string | null;
};

export function CompeteScreen() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [total_time, set_total_time] = useState('');
  const [caught, set_caught] = useState(true);
  const [calf_thrown_by_hand, set_calf_thrown_by_hand] = useState(true);
  const [wrap_and_hooey, set_wrap_and_hooey] = useState(true);
  const [rope_stayed_slack, set_rope_stayed_slack] = useState(true);
  const [tie_held, set_tie_held] = useState(true);
  const [barrier_broken, set_barrier_broken] = useState(false);
  const [jerk_down, set_jerk_down] = useState(false);
  const [notes, set_notes] = useState('');

  const loadRuns = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('tiedown_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setRuns((data as Run[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const resetForm = () => {
    set_total_time('');
    set_caught(true);
    set_calf_thrown_by_hand(true);
    set_wrap_and_hooey(true);
    set_rope_stayed_slack(true);
    set_tie_held(true);
    set_barrier_broken(false);
    set_jerk_down(false);
    set_notes('');
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const rawTimeMs = total_time ? Math.round(Number(total_time) * 1000) : null;

    const profile = await loadRulesProfile(ASSOCIATION_CODE, EVENT_TYPE);
    if (!profile) {
      setSaving(false);
      Alert.alert(
        'No rule set',
        `No ${ASSOCIATION_CODE} rules are seeded for tie-down roping. Cannot score the run.`,
      );
      return;
    }

    let outcome;
    try {
      outcome = scoreTieDownRun({
        rawTimeMs,
        caught,
        calfThrownByHand: calf_thrown_by_hand,
        legsTied: 3,
        wrapAndHooey: wrap_and_hooey,
        tieHeld: tie_held,
        ropeStayedSlack: rope_stayed_slack,
        barrierBroken: barrier_broken,
        loopsThrown: 1,
        jerkDown: jerk_down,
        rulesProfile: profile,
      });
    } catch (e: any) {
      setSaving(false);
      Alert.alert('Could not score run', e?.message ?? 'Scoring engine error.');
      return;
    }

    const officialTimeMs = outcome.officialTimeMs ?? null;

    // Store BOTH raw and penalty-adjusted official time; stats read official.
    const payload = {
      user_id: user.id,
      rule_set_id: profile.ruleSetId,
      raw_time_ms: rawTimeMs,
      official_time_ms: officialTimeMs,
      total_time: officialTimeMs != null ? Math.round(officialTimeMs) / 1000 : null,
      catch_ok: caught,
      calf_thrown_by_hand,
      legs_tied: 3,
      wrap_and_hooey,
      tie_held,
      barrier_broken,
      loops_thrown: 1,
      jerk_down,
      status: outcome.status,
      notes: notes || null,
    };
    const { error } = await supabase.from('tiedown_runs').insert(payload);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    Alert.alert(
      officialTimeMs != null ? `${formatTime(officialTimeMs)}` : outcome.status.replace(/_/g, ' '),
      outcome.explanation,
    );
    resetForm();
    setShowForm(false);
    loadRuns();
  };

  return (
    <ScrollView style={cs.container} contentContainerStyle={cs.content}>
      <View style={cs.headerRow}>
        <Text style={cs.title}>Practice log</Text>
        <TouchableOpacity style={cs.addBtn} onPress={() => setShowForm((v) => !v)}>
          <Text style={cs.addBtnText}>{showForm ? 'Close' : '+ Log run'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={cs.sub}>
        Hand-timed tie-down roping runs stay yours — they are structurally separated from official results and never reach a
        leaderboard. Barrier penalties are applied automatically under the {ASSOCIATION_CODE} rule book.
      </Text>

      {showForm && (
        <View style={cs.form}>
        <View style={cs.field}>
          <Text style={cs.label}>Raw time (s)</Text>
          <TextInput
            style={cs.input}
            value={total_time}
            onChangeText={set_total_time}
            keyboardType={'numeric'}
            placeholder="0"
            placeholderTextColor={colors.muted}
          />
        </View>
        <View style={cs.toggleRow}>
          <Text style={cs.label}>Caught</Text>
          <Switch value={caught} onValueChange={set_caught} trackColor={{ true: colors.accent }} />
        </View>
        <View style={cs.toggleRow}>
          <Text style={cs.label}>Calf thrown by hand</Text>
          <Switch value={calf_thrown_by_hand} onValueChange={set_calf_thrown_by_hand} trackColor={{ true: colors.accent }} />
        </View>
        <View style={cs.toggleRow}>
          <Text style={cs.label}>Wrap &amp; hooey</Text>
          <Switch value={wrap_and_hooey} onValueChange={set_wrap_and_hooey} trackColor={{ true: colors.accent }} />
        </View>
        <View style={cs.toggleRow}>
          <Text style={cs.label}>Rope stayed slack</Text>
          <Switch value={rope_stayed_slack} onValueChange={set_rope_stayed_slack} trackColor={{ true: colors.accent }} />
        </View>
        <View style={cs.toggleRow}>
          <Text style={cs.label}>Tie held (6s)</Text>
          <Switch value={tie_held} onValueChange={set_tie_held} trackColor={{ true: colors.accent }} />
        </View>
        <View style={cs.toggleRow}>
          <Text style={cs.label}>Barrier broken (+ penalty)</Text>
          <Switch value={barrier_broken} onValueChange={set_barrier_broken} trackColor={{ true: colors.accent }} />
        </View>
        <View style={cs.toggleRow}>
          <Text style={cs.label}>Jerk down</Text>
          <Switch value={jerk_down} onValueChange={set_jerk_down} trackColor={{ true: colors.accent }} />
        </View>
        <View style={cs.field}>
          <Text style={cs.label}>Notes</Text>
          <TextInput
            style={cs.input}
            value={notes}
            onChangeText={set_notes}
            placeholder=""
            placeholderTextColor={colors.muted}
            multiline
          />
        </View>
          <TouchableOpacity style={[cs.saveBtn, saving && cs.disabled]} onPress={handleSave} disabled={saving}>
            <Text style={cs.saveBtnText}>{saving ? 'Saving…' : 'Save run'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {(() => {
        // Personal best from OFFICIAL time (penalties included).
        const _vals = runs
          .map((r) => (r.official_time_ms != null ? r.official_time_ms / 1000 : Number(r.total_time)))
          .filter((n: number) => !Number.isNaN(n) && n > 0);
        if (!_vals.length) return null;
        const _best = Math.min(..._vals);
        return (
          <View style={cs.pbBanner}>
            <Text style={cs.pbLabel}>Personal best (official)</Text>
            <Text style={cs.pbValue}>{_best.toFixed(2)}s</Text>
          </View>
        );
      })()}

      <TouchableOpacity style={cs.analyzeBtn} onPress={() => router.push('/analyze')}>
        <Text style={cs.analyzeBtnText}>⭐ Analyze a video</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : runs.length === 0 ? (
        <Text style={cs.empty}>Nothing logged yet. Log your first tie-down roping run above.</Text>
      ) : (
        runs.map((run) => {
          const official =
            run.official_time_ms != null
              ? formatTime(run.official_time_ms)
              : run.total_time != null
                ? String(run.total_time)
                : '—';
          const raw = run.raw_time_ms != null ? formatTime(run.raw_time_ms) : null;
          const hasPenalty =
            run.barrier_broken &&
            run.raw_time_ms != null &&
            run.official_time_ms != null &&
            run.official_time_ms !== run.raw_time_ms;
          return (
            <View key={run.id} style={cs.runCard}>
              <Text style={cs.runPrimary}>
                {run.status === 'no_time' || run.status === 'dq' ? (run.status ?? '').replace(/_/g, ' ') : `${official}s`}
              </Text>
              {hasPenalty && raw ? <Text style={cs.runPenalty}>raw {raw}s + barrier penalty</Text> : null}
              <Text style={cs.runDate}>{new Date(run.created_at).toLocaleDateString()}</Text>
              {run.notes ? <Text style={cs.runNotes}>{run.notes}</Text> : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenX, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  form: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.cardPad, gap: 14, borderWidth: 1, borderColor: colors.border },
  field: { gap: 6 },
  label: { fontSize: 14, color: colors.text, fontWeight: '600' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, padding: 12, color: colors.text, fontSize: 15 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.control, padding: 15, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  analyzeBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: radius.control, padding: 14, alignItems: 'center' },
  analyzeBtnText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  pbBanner: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.cardPad, borderWidth: 1, borderColor: colors.accent, gap: 2 },
  pbLabel: { fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  pbValue: { fontSize: 28, fontWeight: '800', color: colors.accent },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24, fontSize: 14 },
  runCard: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.cardPad, gap: 4, borderWidth: 1, borderColor: colors.border },
  runPrimary: { fontSize: 18, fontWeight: '700', color: colors.text },
  runPenalty: { fontSize: 12, color: colors.accent, fontWeight: '600' },
  runDate: { fontSize: 12, color: colors.muted },
  runNotes: { fontSize: 14, color: colors.muted, marginTop: 4 },
});
