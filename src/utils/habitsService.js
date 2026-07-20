// ─── Habits data-access layer (Supabase) ──────────────────────────────
// Cross-device sync for habits. Same pattern as tasksService.js: Supabase is
// the source of truth, localStorage (nook_habits) is a write-through cache,
// reconciled last-write-wins on the app-level "updatedAt". Deliberately kept
// self-contained and parallel to tasksService (its own getUserId / reconcile)
// so the two modules stay independent — no shared-helper coupling to a file
// that's already committed and working. If we later want to DRY the generic
// reconcile, that's a separate refactor touching both.
//
// Every call no-ops cleanly when auth isn't configured / nobody is signed in
// (returns before touching the network) — same guard-at-boundary contract.
//
// ⚠️ FULL ROWS ONLY. upsert_habits maps each object with jsonb_populate_record,
// which nulls any ABSENT column. Callers must send a COMPLETE habit. (Habits
// already pass full objects up, but the rule holds.)
//
// ⚠️ updatedAt: habits had no updatedAt originally. Handlers now stamp it on
// every write; migrateLocalHabits backfills it to createdAt for existing rows.

import { supabase, isAuthConfigured } from './authClient';

// One-time Supabase-migration flag. DISTINCT from nook_habits_migrated (which
// gates the unrelated trackers→habits copy). Plumbing → CROSS_TAB_IGNORE_KEYS.
export const HABITS_SYNC_MIGRATED_KEY = 'nook_habits_sync_migrated';

const INFRA_COLS = ['user_id', 'created_at', 'updated_at', 'deleted_at'];

function ts(v) { const n = v ? Date.parse(v) : NaN; return Number.isNaN(n) ? 0 : n; }

function rowToHabit(row) {
  const habit = {};
  for (const k of Object.keys(row)) if (!INFRA_COLS.includes(k)) habit[k] = row[k];
  return habit;
}

export async function getUserId() {
  if (!isAuthConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch { return null; }
}

export function isHabitsSyncConfigured() { return Boolean(isAuthConfigured && supabase); }

// ── Writes (atomic, LWW-guarded RPC; fire-and-forget) ───────────────
export async function pushHabits(habitArray) {
  if (!isHabitsSyncConfigured()) return;
  if (!habitArray || !habitArray.length) return;
  const uid = await getUserId();
  if (!uid) return;
  try {
    const { error } = await supabase.rpc('upsert_habits', { p_habits: habitArray });
    if (error) console.warn('[habitsService] push failed:', error.message);
  } catch (e) {
    console.warn('[habitsService] push threw:', e?.message || e);
  }
}

export function pushHabit(habit) { return pushHabits([habit]); }

export function softDeleteHabits(habitArray) {
  if (!habitArray || !habitArray.length) return Promise.resolve();
  const now = new Date().toISOString();
  return pushHabits(habitArray.map(h => ({ ...h, updatedAt: now, deleted_at: now })));
}

export function softDeleteHabit(habit) { return softDeleteHabits([habit]); }

// ── Reads ───────────────────────────────────────────────────────────
export async function fetchHabits() {
  if (!isHabitsSyncConfigured()) return null;
  const uid = await getUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase.from('habits').select('*');
    if (error) { console.warn('[habitsService] fetch failed:', error.message); return null; }
    const live = [], tombstones = [];
    for (const row of data) {
      if (row.deleted_at) tombstones.push({ id: row.id, updatedAt: row.updatedAt });
      else live.push(rowToHabit(row));
    }
    return { live, tombstones };
  } catch (e) {
    console.warn('[habitsService] fetch threw:', e?.message || e);
    return null;
  }
}

// ── One-time migration ──────────────────────────────────────────────
// Seed Supabase from localStorage habits the first time a user signs in on a
// device. Same guarantees as tasks: at most once per device, only when the
// remote set is empty, atomic (single upsert_habits call = one transaction).
// Backfills updatedAt → createdAt (or now) so existing habits carry a
// comparable LWW timestamp. `localHabits` MUST be read by the caller at call
// time (after awaits), so it reflects the post-migrateFromTrackers list.
export async function migrateLocalHabits(localHabits) {
  if (!isHabitsSyncConfigured()) return { status: 'skipped' };
  if (localStorage.getItem(HABITS_SYNC_MIGRATED_KEY) === '1') return { status: 'skipped' };
  const uid = await getUserId();
  if (!uid) return { status: 'skipped' };

  const { count, error: countErr } = await supabase
    .from('habits').select('id', { count: 'exact', head: true });
  if (countErr) { console.warn('[habitsService] migration count failed:', countErr.message); return { status: 'error' }; }

  if (count > 0) {
    localStorage.setItem(HABITS_SYNC_MIGRATED_KEY, '1');
    return { status: 'skipped' };
  }

  if (!localHabits || !localHabits.length) {
    localStorage.setItem(HABITS_SYNC_MIGRATED_KEY, '1');
    return { status: 'nothing' };
  }

  // Backfill the LWW timestamp for rows that predate the updatedAt field.
  const stamped = localHabits.map(h => ({
    ...h,
    updatedAt: h.updatedAt || h.createdAt || new Date().toISOString(),
  }));

  try {
    const { error } = await supabase.rpc('upsert_habits', { p_habits: stamped });
    if (error) { console.warn('[habitsService] migration insert failed:', error.message); return { status: 'error' }; }
  } catch (e) {
    console.warn('[habitsService] migration insert threw:', e?.message || e);
    return { status: 'error' };
  }

  localStorage.setItem(HABITS_SYNC_MIGRATED_KEY, '1');
  return { status: 'migrated', count: stamped.length };
}

// ── Reconcile (pure, LWW on updatedAt) ──────────────────────────────
export function reconcileHabits(local, remoteLive, tombstones = []) {
  const localById = new Map(local.map(h => [h.id, h]));
  const merged = new Map(localById);
  const remoteIds = new Set();
  const toPush = [];

  for (const r of remoteLive) {
    remoteIds.add(r.id);
    const l = localById.get(r.id);
    if (!l) { merged.set(r.id, r); continue; }
    const lu = ts(l.updatedAt), ru = ts(r.updatedAt);
    if (ru > lu) merged.set(r.id, r);
    else if (lu > ru) toPush.push(l);
  }

  const tombIds = new Set();
  for (const tomb of tombstones) {
    tombIds.add(tomb.id);
    const l = merged.get(tomb.id);
    if (!l) continue;
    if (ts(tomb.updatedAt) >= ts(l.updatedAt)) merged.delete(tomb.id);
    else toPush.push(l);
  }

  for (const l of local) {
    if (!remoteIds.has(l.id) && !tombIds.has(l.id)) toPush.push(l);
  }

  return { merged: Array.from(merged.values()), toPush };
}

// Apply a single Realtime change payload to the local list, LWW-guarded.
export function reconcileRemoteHabitChange(local, payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'DELETE') {
    const id = oldRow?.id;
    return id && local.some(h => h.id === id) ? local.filter(h => h.id !== id) : local;
  }

  const row = newRow;
  if (!row || !row.id) return local;
  const idx = local.findIndex(h => h.id === row.id);

  if (row.deleted_at) {
    if (idx === -1) return local;
    return ts(row.updatedAt) >= ts(local[idx].updatedAt) ? local.filter(h => h.id !== row.id) : local;
  }

  const habit = rowToHabit(row);
  if (idx === -1) return [habit, ...local];
  if (ts(habit.updatedAt) > ts(local[idx].updatedAt)) {
    const copy = local.slice();
    copy[idx] = habit;
    return copy;
  }
  return local;
}

export function subscribeToHabits(onChange) {
  if (!isHabitsSyncConfigured()) return () => {};
  let channel = null, cancelled = false;
  (async () => {
    const uid = await getUserId();
    if (cancelled || !uid) return;
    channel = supabase
      .channel(`habits-changes-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${uid}` },
        onChange
      )
      .subscribe();
  })();
  return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
}
