// ─── Tasks data-access layer (Supabase) ───────────────────────────────
// Cross-device sync for tasks. Supabase is the source of truth; the app's
// localStorage `nook-tasks` array stays as a synchronous write-through cache
// so the UI paints instantly and keeps working offline.
//
// This layer sits BESIDE utils/googleTasksSync.js, never through it — the
// two are independent. Both write to the same in-memory task array; both
// reconcile with last-write-wins on the app-level `updatedAt`.
//
// ONE deliberate exception to that independence: googleTasksSync's pull path
// imports softDeleteTask, because a delete has to be agreed on by both sync
// systems or neither owns it. A task deleted on Google was removed from local
// state with no Supabase tombstone, so the next hydrate re-adopted it as
// remote-only, forever. Nothing else crosses the boundary.
//
// EVERY call is a clean no-op when auth isn't configured or nobody is signed
// in (returns early before touching the network), so an unauthenticated,
// local-only user degrades to exactly the pre-sync behavior — never an error.
// The upsert_tasks RPC's own `raise 'not authenticated'` is only a
// server-side backstop that these guards keep unreachable in normal flow.
//
// ⚠️ FULL ROWS ONLY. The upsert_tasks RPC maps each JSON object onto the row
// with jsonb_populate_record, which sets any ABSENT column to null. So every
// object handed to pushTask/pushTasks must be a COMPLETE task, never a
// partial patch — a partial would null out every field it omits. Callers that
// do partial edits (e.g. the detail-panel auto-save) must merge onto the
// existing task first and send the merged result.

import { supabase, isAuthConfigured } from './authClient';

// Per-device one-time flag: local→Supabase task migration has been settled.
// Plumbing (like nook_habits_migrated), so it lives in CROSS_TAB_IGNORE_KEYS.
export const TASKS_MIGRATED_KEY = 'nook_tasks_migrated';

// Supabase snake_case infra columns that aren't part of the local task shape.
// Stripped on read so a synced task looks identical to a local-only one.
const INFRA_COLS = ['user_id', 'created_at', 'updated_at', 'deleted_at'];

function ts(v) { const n = v ? Date.parse(v) : NaN; return Number.isNaN(n) ? 0 : n; }

// Every row that leaves this module MUST carry a non-null updatedAt.
//
// upsert_tasks' LWW guard is `excluded."updatedAt" > t."updatedAt"`. SQL
// three-valued logic makes that NULL — never true — the moment either side is
// null, so a row that once lands with a null updatedAt can never be updated or
// soft-deleted again, and resurrects on every hydrate. Tasks written by the app
// are always stamped, but migrateTask() in App.jsx rebuilds pre-`updatedAt`
// tasks without one, and a backup archive can carry the same shape.
//
// habitsService has always done this at its migration boundary; tasks did not.
// Migration 0011 hardens the SQL guard as well — this is the client half.
function stampUpdatedAt(rows) {
  const now = new Date().toISOString();
  return rows.map(t => t.updatedAt ? t : { ...t, updatedAt: t.createdAt || now });
}

// Row (camelCase task columns + snake_case infra columns) → clean task object.
function rowToTask(row) {
  const task = {};
  for (const k of Object.keys(row)) if (!INFRA_COLS.includes(k)) task[k] = row[k];
  // numeric comes back as a string in some PostgREST versions; local shape is a number.
  if (task.timeLogged != null) task.timeLogged = Number(task.timeLogged);
  return task;
}

// Resolve the signed-in user id from the cached session (no network round-trip).
export async function getUserId() {
  if (!isAuthConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch { return null; }
}

// True only when tasks sync could actually run (auth configured). The per-call
// guards still re-check the live session, so this is just a cheap short-circuit.
export function isTasksSyncConfigured() { return Boolean(isAuthConfigured && supabase); }

// ── Writes ──────────────────────────────────────────────────────────
// All writes go through the atomic, LWW-guarded upsert_tasks RPC. Fire-and-
// forget from the caller's perspective: a network failure is swallowed (logged)
// so it can never block a local edit. Offline edits are re-pushed by the next
// reconcile (they surface as "local newer" / "local-only" → toPush).

export async function pushTasks(taskArray) {
  if (!isTasksSyncConfigured()) return;
  if (!taskArray || !taskArray.length) return;
  const uid = await getUserId();
  if (!uid) return;                          // signed out → clean no-op
  try {
    // Stamped at the boundary so no caller can freeze a row with a null
    // updatedAt — see stampUpdatedAt. A task that already has one is passed
    // through untouched, so this never rewrites a genuine edit time.
    const { error } = await supabase.rpc('upsert_tasks', { p_tasks: stampUpdatedAt(taskArray) });
    if (error) console.warn('[tasksService] push failed:', error.message);
  } catch (e) {
    console.warn('[tasksService] push threw:', e?.message || e);
  }
}

export function pushTask(task) { return pushTasks([task]); }

// Soft delete: keep the row, stamp deleted_at (a tombstone) and bump updatedAt
// so the deletion wins LWW and propagates to other devices instead of the task
// reappearing on their next fetch. Sends the FULL task + the two extra columns.
export function softDeleteTasks(taskArray) {
  if (!taskArray || !taskArray.length) return Promise.resolve();
  const now = new Date().toISOString();
  return pushTasks(taskArray.map(t => ({ ...t, updatedAt: now, deleted_at: now })));
}

export function softDeleteTask(task) { return softDeleteTasks([task]); }

// ── Reads ───────────────────────────────────────────────────────────
// Fetch the user's whole task set. Returns null on any failure (offline,
// signed out, not configured) so the caller keeps its local cache untouched.
// `live` are non-deleted tasks; `tombstones` carry just { id, updatedAt } so
// reconcile can decide whether a remote deletion should remove a local task.
export async function fetchTasks() {
  if (!isTasksSyncConfigured()) return null;
  const uid = await getUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase.from('tasks').select('*');
    if (error) { console.warn('[tasksService] fetch failed:', error.message); return null; }
    const live = [], tombstones = [];
    for (const row of data) {
      if (row.deleted_at) tombstones.push({ id: row.id, updatedAt: row.updatedAt });
      else live.push(rowToTask(row));
    }
    return { live, tombstones };
  } catch (e) {
    console.warn('[tasksService] fetch threw:', e?.message || e);
    return null;
  }
}

// ── One-time migration (Phase 4) ────────────────────────────────────
// Seed Supabase from the existing localStorage tasks the first time a user
// signs in on a device, then never again. Idempotent and duplicate-safe by
// construction:
//   • Runs at most once per device (TASKS_MIGRATED_KEY flag).
//   • Only bulk-inserts when the user's remote task set is EMPTY — if another
//     device already migrated, this one skips the insert and lets hydrate/
//     reconcile merge instead.
//   • The bulk upsert is a SINGLE upsert_tasks call = a single Postgres
//     transaction (plpgsql function). So it is atomic: it either writes every
//     task or, on any error, writes NONE and rolls back. There is no partial-
//     insert state. On failure we do NOT set the flag and do NOT touch local
//     data, so it simply retries on the next load.
//
// `localTasks` MUST be read by the caller at call time (e.g. from a live ref),
// not captured earlier — see the sequencing note at the call site.
//
// Returns { status } where status is one of:
//   'skipped'   – not configured / signed out / already migrated / remote non-empty
//   'nothing'   – configured & empty remote, but no local tasks to migrate
//   'migrated'  – bulk insert succeeded (count = number of tasks)
//   'error'     – a query/insert failed; flag NOT set, will retry next load
export async function migrateLocalTasks(localTasks) {
  if (!isTasksSyncConfigured()) return { status: 'skipped' };
  if (localStorage.getItem(TASKS_MIGRATED_KEY) === '1') return { status: 'skipped' };
  const uid = await getUserId();
  if (!uid) return { status: 'skipped' };

  // Never duplicate onto a device/account that already has server tasks.
  const { count, error: countErr } = await supabase
    .from('tasks').select('id', { count: 'exact', head: true });
  if (countErr) { console.warn('[tasksService] migration count failed:', countErr.message); return { status: 'error' }; }

  if (count > 0) {
    // Already has remote tasks (migrated elsewhere) — stop checking on this device.
    localStorage.setItem(TASKS_MIGRATED_KEY, '1');
    return { status: 'skipped' };
  }

  if (!localTasks || !localTasks.length) {
    // Empty remote AND empty local — nothing to do, but record it so we don't
    // re-run the count query on every future load.
    localStorage.setItem(TASKS_MIGRATED_KEY, '1');
    return { status: 'nothing' };
  }

  // Backfill the LWW timestamp for tasks that predate the updatedAt field
  // (migrateTask() in App.jsx rebuilds the legacy shape without one). Without
  // this they land with a null updatedAt and are frozen forever — the exact
  // backfill habitsService has always done at this boundary.
  const stamped = stampUpdatedAt(localTasks);

  try {
    const { error } = await supabase.rpc('upsert_tasks', { p_tasks: stamped });
    if (error) { console.warn('[tasksService] migration insert failed:', error.message); return { status: 'error' }; }
  } catch (e) {
    console.warn('[tasksService] migration insert threw:', e?.message || e);
    return { status: 'error' };
  }

  localStorage.setItem(TASKS_MIGRATED_KEY, '1');
  return { status: 'migrated', count: stamped.length };
}

// ── Restore from a backup archive (audit C2) ────────────────────────
// Import writes localStorage and reloads — which was enough back when tasks
// were local-only, and silently wrong once Supabase became the cross-device
// source of truth. A task deleted AFTER the backup was taken still had a
// tombstone with a newer updatedAt, so reconcileTasks deleted it again on the
// very next hydrate: the restore reported success and the task vanished.
//
// restore_tasks is backup-wins (no LWW guard) and clears deleted_at, so the
// archive's copy is what survives. It never deletes, so tasks created since
// the backup are kept — a restore is a union, not a replacement. See the
// header of migration 0011 for the full reasoning and the one deliberate
// difference from the reminder restore in 0010 (task ids are kept, not
// reassigned, because they are referenced by Google sync and reminders).
//
// Returns { restored } on success, or { restored: 0, skipped } when there is
// no account to restore into. Throws only on a real write failure, so the
// caller can tell "nothing to do" apart from "it broke" — same contract as
// restoreReminders.
export async function restoreTasks(rows) {
  if (!isTasksSyncConfigured()) return { restored: 0, skipped: 'not_configured' };
  const uid = await getUserId();
  if (!uid) return { restored: 0, skipped: 'signed_out' };

  // Drop anything unkeyable rather than letting one malformed row abort the
  // transaction and lose the good ones with it.
  const payload = stampUpdatedAt((rows || []).filter(t => t && t.id));
  if (!payload.length) return { restored: 0 };

  const { error } = await supabase.rpc('restore_tasks', { p_tasks: payload });
  if (error) throw new Error(error.message);
  return { restored: payload.length };
}

// Pure last-write-wins merge of local state with a remote snapshot.
// Returns { merged, toPush }:
//   merged  – the reconciled task list to render.
//   toPush  – local tasks the server hasn't got the latest of (local newer,
//             or local-only) that should be upserted back up.
// Comparison is by parsed timestamp, NOT string compare: local stamps end in
// 'Z' while PostgREST returns '+00:00', so lexicographic compare would be wrong.
export function reconcileTasks(local, remoteLive, tombstones = []) {
  const localById = new Map(local.map(t => [t.id, t]));
  const merged = new Map(localById);   // preserves local order; remote-only appended
  const remoteIds = new Set();
  const toPush = [];

  for (const r of remoteLive) {
    remoteIds.add(r.id);
    const l = localById.get(r.id);
    if (!l) { merged.set(r.id, r); continue; }   // remote-only → adopt
    const lu = ts(l.updatedAt), ru = ts(r.updatedAt);
    if (ru > lu) merged.set(r.id, r);            // remote newer → take remote
    else if (lu > ru) toPush.push(l);            // local newer → push up
    // equal → already have it, no-op
  }

  const tombIds = new Set();
  for (const tomb of tombstones) {
    tombIds.add(tomb.id);
    const l = merged.get(tomb.id);
    if (!l) continue;
    if (ts(tomb.updatedAt) >= ts(l.updatedAt)) merged.delete(tomb.id); // deletion wins
    else toPush.push(l);                          // local edited after deletion → resurrect
  }

  for (const l of local) {                        // local-only (never seen remotely) → push up
    if (!remoteIds.has(l.id) && !tombIds.has(l.id)) toPush.push(l);
  }

  return { merged: Array.from(merged.values()), toPush };
}

// ── Realtime (Phase 5) ──────────────────────────────────────────────
// Apply a single Realtime change payload to the local list, LWW-guarded.
// Pure: returns the same array reference when nothing changes (so a no-op
// event — e.g. the echo of our own write — doesn't force a re-render).
//   INSERT/UPDATE with deleted_at → tombstone (remove if remote is newer-or-equal)
//   INSERT/UPDATE otherwise        → adopt/replace if remote is strictly newer
//   DELETE (hard)                  → remove by id (rare; app deletes are soft)
export function reconcileRemoteChange(local, payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'DELETE') {
    const id = oldRow?.id;
    return id && local.some(t => t.id === id) ? local.filter(t => t.id !== id) : local;
  }

  const row = newRow;
  if (!row || !row.id) return local;
  const idx = local.findIndex(t => t.id === row.id);

  if (row.deleted_at) {                    // remote soft-delete
    if (idx === -1) return local;
    return ts(row.updatedAt) >= ts(local[idx].updatedAt) ? local.filter(t => t.id !== row.id) : local;
  }

  const task = rowToTask(row);
  if (idx === -1) return [task, ...local];               // new remote task
  if (ts(task.updatedAt) > ts(local[idx].updatedAt)) {   // remote newer → replace
    const copy = local.slice();
    copy[idx] = task;
    return copy;
  }
  return local;                            // local newer or equal (incl. our own echo) → no-op
}

// Subscribe to this user's task changes. Calls onChange(payload) for every
// insert/update/delete. Returns an unsubscribe function. No-ops (returns a
// noop unsubscribe) when unconfigured / signed out.
export function subscribeToTasks(onChange) {
  if (!isTasksSyncConfigured()) return () => {};
  let channel = null, cancelled = false;
  (async () => {
    const uid = await getUserId();
    if (cancelled || !uid) return;
    channel = supabase
      .channel(`tasks-changes-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${uid}` },
        onChange
      )
      .subscribe();
  })();
  return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
}
