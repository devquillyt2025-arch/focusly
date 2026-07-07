/*
 * GOOGLE TASKS TWO-WAY SYNC ENGINE
 * 
 * LIMITATION TO NOTE:
 * This sync only works on the device/browser where Google Tasks was connected, since all sync state lives in localStorage. 
 * If the user opens Nook on another device, it will not see previously synced data and may create duplicates.
 * Note: Tokens are stored in localStorage (`nook_google_tokens`). This should move to httpOnly cookies or a backend if multi-device support is ever added.
 * This integration is scoped to the tasks/tracker module only (habits, goals, and journal modules are untouched).
 */

// ─── PKCE OAuth Helper Functions ────────────────────────────────────────────────────────
function generateRandomString(length) {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('').slice(0, length);
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function connectGoogleTasks() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  if (!clientId) {
    alert('VITE_GOOGLE_CLIENT_ID not found in .env.local. Please make sure .env.local is created and restart your Vite dev server.');
    return;
  }

  const verifier = generateRandomString(64);
  localStorage.setItem('nook_pkce_verifier', verifier);

  const challenge = await generateCodeChallenge(verifier);
  const redirectUri = window.location.origin + window.location.pathname;


  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/tasks',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent' // Forces refresh token generation
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

let authCallbackInProgress = false;

export async function handleAuthCallback() {
  if (authCallbackInProgress) return false;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;

  const verifier = localStorage.getItem('nook_pkce_verifier');
  if (!verifier) {
    console.warn('[Google Tasks Sync] OAuth code found in URL, but no PKCE verifier found in localStorage (likely already processed).');
    return false;
  }

  authCallbackInProgress = true;
  // Immediately remove verifier to prevent React StrictMode double-execution
  localStorage.removeItem('nook_pkce_verifier');

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
  const redirectUri = window.location.origin + window.location.pathname;

  if (!clientId || !clientSecret) {
    alert('VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_CLIENT_SECRET not found in .env.local. Please make sure .env.local is created and restart your Vite dev server.');
    authCallbackInProgress = false;
    return false;
  }


  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Google Tasks Sync] Failed to exchange token:', errText);
      alert(`Google Tasks Auth Failed during token exchange.\nError: ${errText}\n\nPlease check that your Redirect URI (${redirectUri}) is exactly matched in Google Cloud Console.`);
      authCallbackInProgress = false;
      return false;
    }

    const data = await res.json();
    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;


    localStorage.setItem('nook_google_tokens', JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt
    }));
    localStorage.setItem('nook_sync_enabled', 'true');

    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    authCallbackInProgress = false;
    return true;
  } catch (err) {
    console.error('[Google Tasks Sync] OAuth callback error:', err);
    alert(`Google Tasks OAuth callback error: ${err.message}`);
    authCallbackInProgress = false;
    return false;
  }
}

export async function getValidAccessToken(onStatusChange) {
  const tokensStr = localStorage.getItem('nook_google_tokens');
  if (!tokensStr) {
    return null;
  }

  let tokens;
  try { tokens = JSON.parse(tokensStr); } catch { return null; }

  // If valid for at least 1 more minute
  if (tokens.accessToken && tokens.expiresAt && Date.now() < tokens.expiresAt - 60000) {
    return tokens.accessToken;
  }


  if (!tokens.refreshToken) {
    console.error('[Google Tasks Sync] No refresh token available.');
    if (onStatusChange) onStatusChange('Sync failed — retry');
    return null;
  }

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    console.error('[Google Tasks Sync] Client credentials missing in .env.local.');
    if (onStatusChange) onStatusChange('Sync failed — retry');
    return null;
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Google Tasks Sync] Token refresh failed:', errText);
      if (onStatusChange) onStatusChange('Sync failed — retry');
      alert(`Your Google Tasks connection has expired or was revoked.\nError: ${errText}\n\nPlease reconnect in Settings.`);
      disconnectGoogleTasks();
      return null;
    }

    const data = await res.json();
    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    const newTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken, // keep old if not returned
      expiresAt
    };

    localStorage.setItem('nook_google_tokens', JSON.stringify(newTokens));
    return newTokens.accessToken;
  } catch (err) {
    console.error('[Google Tasks Sync] Refresh token error:', err);
    if (onStatusChange) onStatusChange('Sync failed — retry');
    return null;
  }
}

// ─── Task Model Mapping ─────────────────────────────────────────────────────────────────
export function nookToGoogleTask(task) {
  const res = {
    title: task.name || 'Untitled',
    notes: task.notes || '',
    status: task.status === 'completed' ? 'completed' : 'needsAction'
  };
  if (task.dueDate) {
    res.due = `${task.dueDate}T00:00:00.000Z`;
  } else {
    res.due = null;
  }
  return res;
}

// ─── Offline Queue & Rate Limiting ───────────────────────────────────────────────────────
export function pushSyncQueue(action) {
  if (localStorage.getItem('nook_sync_enabled') !== 'true') return;
  const qStr = localStorage.getItem('nook_sync_queue');
  let q = [];
  try { q = qStr ? JSON.parse(qStr) : []; } catch {}
  
  // Deduplicate or replace existing operations on the same task
  if (action.type === 'UPDATE' || action.type === 'CREATE') {
    q = q.filter(item => item.taskId !== action.taskId);
  } else if (action.type === 'DELETE') {
    q = q.filter(item => item.taskId !== action.taskId);
    const delStr = localStorage.getItem('nook_deleted_tasks');
    let deletedIds = [];
    try { deletedIds = delStr ? JSON.parse(delStr) : []; } catch {}
    if (action.googleTaskId && !deletedIds.includes(action.googleTaskId)) {
      deletedIds.push(action.googleTaskId);
      localStorage.setItem('nook_deleted_tasks', JSON.stringify(deletedIds));
    }
  }

  q.push(action);
  localStorage.setItem('nook_sync_queue', JSON.stringify(q));
}

// ─── Two-Way Sync Engine ────────────────────────────────────────────────────────────────
let syncInProgress = false;
let lastSyncTimestamp = 0; // For debouncing window focus triggers

export async function pushLocalChangesToGoogle(tasks, token) {
  const qStr = localStorage.getItem('nook_sync_queue');
  let q = [];
  try { q = qStr ? JSON.parse(qStr) : []; } catch {}
  if (!q.length) return tasks;

  let updatedTasks = [...tasks];
  const remainingQ = [];

  // Fetch all existing Google Tasks once to match child subtasks easily
  const allRes = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showDeleted=true', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  let existingGTasks = [];
  if (allRes.ok) {
    const d = await allRes.json();
    existingGTasks = d.items || [];
  }

  const delStr = localStorage.getItem('nook_deleted_tasks');
  let deletedIds = [];
  try { deletedIds = delStr ? JSON.parse(delStr) : []; } catch {}

  for (const op of q) {
    // Small delay between requests to respect Google Tasks API usage limits
    await new Promise(r => setTimeout(r, 100));

    if (op.type === 'CREATE' || op.type === 'UPDATE') {
      let localTask = updatedTasks.find(t => t.id === op.taskId);
      if (!localTask) continue; // task was deleted before sync

      let parentGoogleTaskId = localTask.googleTaskId;

      if (op.type === 'CREATE' || !parentGoogleTaskId) {
        const res = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(nookToGoogleTask(localTask))
        });

        if (res.ok) {
          const data = await res.json();
          const nowIso = new Date().toISOString();
          parentGoogleTaskId = data.id;
          updatedTasks = updatedTasks.map(t => t.id === op.taskId ? { ...t, googleTaskId: data.id, lastSyncedAt: nowIso } : t);
          localTask = updatedTasks.find(t => t.id === op.taskId);
        } else if (res.status === 429) {
          remainingQ.push(op); // Rate limited, keep in queue
          continue;
        } else {
          const errText = await res.text();
          console.error('[Google Tasks Sync] POST task failed:', errText);
          if (res.status === 403) {
            alert(`Google Tasks API Error (403 Forbidden).\n\nPlease ensure the Google Tasks API is ENABLED in your Google Cloud Console for project 505104249489.\n\nDetails: ${errText}`);
          }
          continue;
        }
      } else {
        const res = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${parentGoogleTaskId}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(nookToGoogleTask(localTask))
        });

        if (res.ok) {
          const nowIso = new Date().toISOString();
          updatedTasks = updatedTasks.map(t => t.id === op.taskId ? { ...t, lastSyncedAt: nowIso } : t);
          localTask = updatedTasks.find(t => t.id === op.taskId);
        } else if (res.status === 429) {
          remainingQ.push(op);
          continue;
        } else if (res.status === 404) {
          console.warn('[Google Tasks Sync] Conflict: Task deleted on Google Tasks but updated locally.');
          updatedTasks = updatedTasks.map(t => t.id === op.taskId ? { ...t, syncConflict: 'Deleted on Google Tasks, edited locally', googleTaskId: null } : t);
          continue;
        } else {
          const errText = await res.text();
          console.error('[Google Tasks Sync] PATCH task failed:', errText);
          if (res.status === 403) {
            alert(`Google Tasks API Error (403 Forbidden).\n\nPlease ensure the Google Tasks API is ENABLED in your Google Cloud Console for project 505104249489.\n\nDetails: ${errText}`);
          }
          continue;
        }
      }

      // ─── Sync Subtasks for this Parent Task ───
      if (parentGoogleTaskId) {
        const currentGChildren = existingGTasks.filter(gt => gt.parent === parentGoogleTaskId && !gt.deleted);
        let updatedSubtasks = [...(localTask.subtasks || [])];
        let subtasksChanged = false;

        // 1. Check for deleted subtasks
        for (const gChild of currentGChildren) {
          if (deletedIds.includes(gChild.id)) {
            await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${gChild.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
          }
        }

        // 2. Create or update active subtasks
        for (let i = 0; i < updatedSubtasks.length; i++) {
          const sub = updatedSubtasks[i];
          let match = currentGChildren.find(gt => gt.id === sub.googleTaskId || gt.title === sub.text);

          if (!match || !sub.googleTaskId) {
            const subRes = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks?parent=${parentGoogleTaskId}`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: sub.text || 'Untitled subtask',
                status: sub.completed ? 'completed' : 'needsAction'
              })
            });
            if (subRes.ok) {
              const subData = await subRes.json();
              updatedSubtasks[i] = { ...sub, googleTaskId: subData.id };
              subtasksChanged = true;
              existingGTasks.push(subData);
            }
          } else if (match) {
            if (match.title !== sub.text || (match.status === 'completed') !== !!sub.completed) {
              const subRes = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${match.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: sub.text || 'Untitled subtask',
                  status: sub.completed ? 'completed' : 'needsAction'
                })
              });
              if (subRes.ok) {
                const subData = await subRes.json();
                updatedSubtasks[i] = { ...sub, googleTaskId: subData.id };
                subtasksChanged = true;
              }
            } else if (!sub.googleTaskId) {
              updatedSubtasks[i] = { ...sub, googleTaskId: match.id };
              subtasksChanged = true;
            }
          }
        }

        if (subtasksChanged) {
          updatedTasks = updatedTasks.map(t => t.id === op.taskId ? { ...t, subtasks: updatedSubtasks } : t);
        }
      }

    } else if (op.type === 'DELETE') {
      if (!op.googleTaskId) continue;
      const res = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${op.googleTaskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok && res.status === 429) {
        remainingQ.push(op);
      } else if (!res.ok) {
        console.error('[Google Tasks Sync] DELETE task failed:', await res.text());
      }
    }
  }

  localStorage.setItem('nook_sync_queue', JSON.stringify(remainingQ));
  return updatedTasks;
}

export async function pullTasksFromGoogle(tasks, setTasks, token, onStatusChange) {
  // Always fetch full list to ensure parent/child relationships resolve correctly
  const url = 'https://www.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showDeleted=true';

  const pullRes = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!pullRes.ok) {
    const errText = await pullRes.text();
    console.error('[Google Tasks Sync] Pull sync failed:', pullRes.status, errText);
    if (onStatusChange) onStatusChange('Sync failed — retry');
    if (pullRes.status === 403) {
      alert(`Google Tasks API Error (403 Forbidden).\n\nPlease ensure the Google Tasks API is ENABLED in your Google Cloud Console for project 505104249489.\n\nDetails: ${errText}`);
    } else {
      alert(`Google Tasks sync failed (${pullRes.status}): ${errText}`);
    }
    throw new Error(`Pull sync failed: ${pullRes.status}`);
  }

  const pullData = await pullRes.json();
  const gTasks = pullData.items || [];
  const nowIso = new Date().toISOString();


  let updatedTasks = [...tasks];
  let taskStateChanged = false;

  const delStr = localStorage.getItem('nook_deleted_tasks');
  let deletedIds = [];
  try { deletedIds = delStr ? JSON.parse(delStr) : []; } catch {}

  // Separate top-level parent tasks and subtasks
  const gParentTasks = gTasks.filter(t => !t.parent);
  const gSubtasks = gTasks.filter(t => t.parent);

  for (const gTask of gParentTasks) {
    const localTask = updatedTasks.find(t => t.googleTaskId === gTask.id);

    if (!localTask) {
      if (gTask.deleted) continue;
      
      // Check if deleted locally but updated on Google Tasks (conflict)
      if (deletedIds.includes(gTask.id)) {
        console.warn(`[Google Tasks Sync] Conflict logged: Task "${gTask.title}" was deleted locally but updated on Google Tasks.`);
      } else {
        const newTask = {
          id: String(Date.now() + Math.random()),
          name: gTask.title || 'Untitled',
          category: 'work',
          priority: 'none',
          timeEstimate: 25,
          notes: gTask.notes || '',
          dueDate: gTask.due ? gTask.due.split('T')[0] : '',
          completed: gTask.status === 'completed',
          status: gTask.status || 'needsAction',
          timeLogged: 0,
          pomodorosCompleted: 0,
          createdAt: gTask.updated || new Date().toISOString(),
          completedAt: gTask.status === 'completed' ? (gTask.completed || new Date().toISOString()) : null,
          recurrence: null,
          recurrenceDays: [],
          subtasks: [],
          googleTaskId: gTask.id,
          lastSyncedAt: nowIso,
          updatedAt: gTask.updated || new Date().toISOString(),
          syncConflict: null
        };
        updatedTasks.push(newTask);
        taskStateChanged = true;
      }
    } else {
      // Matching local task found
      if (gTask.deleted) {
        const localUpdated = new Date(localTask.updatedAt || localTask.createdAt).getTime();
        const localSynced = new Date(localTask.lastSyncedAt || 0).getTime();
        if (localUpdated > localSynced) {
          console.warn(`[Google Tasks Sync] Conflict logged: Task "${localTask.name}" deleted on Google Tasks, but edited locally.`);
        } else {
          updatedTasks = updatedTasks.filter(t => t.id !== localTask.id);
          taskStateChanged = true;
        }
      } else {
        // Compare timestamps (last-write-wins)
        const gUpdated = new Date(gTask.updated).getTime();
        const localUpdated = new Date(localTask.updatedAt || localTask.createdAt).getTime();
        const localSynced = new Date(localTask.lastSyncedAt || 0).getTime();

        // If Google Task is newer than our last sync AND newer than local update
        if (gUpdated > localSynced && gUpdated > localUpdated) {
          updatedTasks = updatedTasks.map(t => t.id === localTask.id ? {
            ...t,
            name: gTask.title || 'Untitled',
            notes: gTask.notes || '',
            dueDate: gTask.due ? gTask.due.split('T')[0] : '',
            completed: gTask.status === 'completed',
            status: gTask.status || 'needsAction',
            completedAt: gTask.status === 'completed' ? (gTask.completed || t.completedAt || new Date().toISOString()) : null,
            lastSyncedAt: nowIso,
            updatedAt: gTask.updated
          } : t);
          taskStateChanged = true;
        } else if (localUpdated > gUpdated) {
        }
      }
    }
  }

  // ─── Process Subtasks ───
  for (const gSub of gSubtasks) {
    const parentTask = updatedTasks.find(t => t.googleTaskId === gSub.parent);
    if (!parentTask) continue;

    const localSub = (parentTask.subtasks || []).find(s => s.googleTaskId === gSub.id || s.text === gSub.title);

    if (!localSub) {
      if (gSub.deleted) continue;
      if (deletedIds.includes(gSub.id)) continue;

      const newSub = {
        id: String(Date.now() + Math.random()),
        text: gSub.title || 'Untitled subtask',
        completed: gSub.status === 'completed',
        status: gSub.status || 'needsAction',
        googleTaskId: gSub.id,
        updatedAt: gSub.updated
      };
      const nextSubs = [...(parentTask.subtasks || []), newSub];
      updatedTasks = updatedTasks.map(t => t.id === parentTask.id ? { ...t, subtasks: nextSubs } : t);
      taskStateChanged = true;
    } else {
      if (gSub.deleted) {
        const nextSubs = (parentTask.subtasks || []).filter(s => s.id !== localSub.id);
        updatedTasks = updatedTasks.map(t => t.id === parentTask.id ? { ...t, subtasks: nextSubs } : t);
        taskStateChanged = true;
      } else {
        const gUpdated = new Date(gSub.updated).getTime();
        const localUpdated = new Date(localSub.updatedAt || parentTask.updatedAt || parentTask.createdAt).getTime();
        const localSynced = new Date(parentTask.lastSyncedAt || 0).getTime();

        if (gUpdated > localSynced && gUpdated > localUpdated) {
          const nextSubs = (parentTask.subtasks || []).map(s => s.id === localSub.id ? {
            ...s,
            text: gSub.title || 'Untitled subtask',
            completed: gSub.status === 'completed',
            status: gSub.status || 'needsAction',
            googleTaskId: gSub.id,
            updatedAt: gSub.updated
          } : s);
          updatedTasks = updatedTasks.map(t => t.id === parentTask.id ? { ...t, subtasks: nextSubs } : t);
          taskStateChanged = true;
        } else if (!localSub.googleTaskId) {
          const nextSubs = (parentTask.subtasks || []).map(s => s.id === localSub.id ? { ...s, googleTaskId: gSub.id } : s);
          updatedTasks = updatedTasks.map(t => t.id === parentTask.id ? { ...t, subtasks: nextSubs } : t);
          taskStateChanged = true;
        }
      }
    }
  }

  localStorage.setItem('nook_last_pull_sync', nowIso);
  if (taskStateChanged) {
    setTasks(updatedTasks);
  }
}

export async function syncTasks(tasks, setTasks, onStatusChange, isFocusTrigger = false) {
  if (localStorage.getItem('nook_sync_enabled') !== 'true') {
    if (onStatusChange) onStatusChange('Not connected');
    return;
  }
  if (!navigator.onLine) {
    if (onStatusChange) onStatusChange('Sync failed — retry');
    return;
  }
  // Debounce window focus trigger by 30 seconds
  if (isFocusTrigger && Date.now() - lastSyncTimestamp < 30000) {
    return;
  }
  if (syncInProgress) {
    return;
  }
  syncInProgress = true;
  if (onStatusChange) onStatusChange('Syncing...');

  const token = await getValidAccessToken(onStatusChange);
  if (!token) {
    console.error('[Google Tasks Sync] Could not get valid access token.');
    syncInProgress = false;
    return;
  }

  try {
    // 1. Push local changes to Google Tasks first
    const updatedTasks = await pushLocalChangesToGoogle(tasks, token);

    // 2. Pull remote changes from Google Tasks second
    await pullTasksFromGoogle(updatedTasks, setTasks, token, onStatusChange);

    lastSyncTimestamp = Date.now();
    if (onStatusChange) onStatusChange('Synced');
  } catch (err) {
    console.error('[Google Tasks Sync] syncTasks orchestrator error:', err);
    if (onStatusChange) onStatusChange('Sync failed — retry');
  } finally {
    syncInProgress = false;
  }
}
  
export async function directGoogleTaskUpdate(googleTaskId, updates) {
  const token = await getValidAccessToken();
  if (!token) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${googleTaskId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return res.ok;
  } catch (err) {
    console.error('[Google Tasks Sync] Direct Update failed:', err);
    return false;
  }
}

export async function directGoogleTaskDelete(googleTaskId) {
  const token = await getValidAccessToken();
  if (!token) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${googleTaskId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok || res.status === 404;
  } catch (err) {
    console.error('[Google Tasks Sync] Direct Delete failed:', err);
    return false;
  }
}

export function disconnectGoogleTasks() {
  localStorage.removeItem('nook_google_tokens');
  localStorage.removeItem('nook_sync_enabled');
  localStorage.removeItem('nook_sync_queue');
  localStorage.removeItem('nook_last_pull_sync');
  localStorage.removeItem('nook_deleted_tasks');
}
