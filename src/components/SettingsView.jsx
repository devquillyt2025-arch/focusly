import { memo,  useState, useEffect, useRef } from 'react';
import { connectGoogleTasks, disconnectGoogleTasks } from '../utils/googleTasksSync';
import { supabase, isAuthConfigured } from '../utils/authClient';
import { isPushSupported, isCurrentlySubscribed, subscribeToPush, unsubscribeFromPush } from '../utils/pushSubscription';
import { isEmailRemindersEnabled, setEmailRemindersEnabled } from '../utils/notificationPrefs';
import Select from './Select';

const PRESETS = [
  { label: 'Standard',  sub: '25/5/15',  vals: { focusDuration: 25, shortDuration: 5,  longDuration: 15 } },
  { label: 'Short',     sub: '20/3/10',  vals: { focusDuration: 20, shortDuration: 3,  longDuration: 10 } },
  { label: 'Long',      sub: '50/10/20', vals: { focusDuration: 50, shortDuration: 10, longDuration: 20 } },
  { label: 'Deep Work', sub: '90/15/30', vals: { focusDuration: 90, shortDuration: 15, longDuration: 30 } },
];

const EMOJI_AVATARS = ['😎', '🤓', '👩‍💻', '👨‍🚀', '🦄', '👻'];

export default memo(function SettingsView({ settings, onSaveSettings, theme, onSetTheme, onClearData, onImportData, syncStatus, onSyncToggle, onDisconnect, onSyncNow, onUpdateProfile, initialProfileName, initialProfileEmail, initialProfileAvatar, gcalConnected, onConnectGCal, onDisconnectGCal }) {
  // Profile state — seed from App.jsx's already-resolved state (same values the header shows)
  const [profileName, setProfileName] = useState(
    () => initialProfileName || localStorage.getItem('nook-profile-name') || 'Productivity User'
  );
  const [profileEmail, setProfileEmail] = useState(
    () => initialProfileEmail || localStorage.getItem('nook-profile-email') || ''
  );
  const [avatar, setAvatar] = useState(
    () => initialProfileAvatar || localStorage.getItem('nook-profile-avatar') || '😎'
  );

  // Keep a stable ref to onUpdateProfile so the save effect doesn't re-fire when the parent re-renders
  const onUpdateProfileRef = useRef(onUpdateProfile);
  useEffect(() => { onUpdateProfileRef.current = onUpdateProfile; });

  // Notifications state
  const [notifMaster, setNotifMaster] = useState(() => localStorage.getItem('nook-notif-master') !== 'false');
  const [notifMorning, setNotifMorning] = useState(() => localStorage.getItem('nook-notif-morning') !== 'false');
  const [morningTime, setMorningTime] = useState(() => localStorage.getItem('nook-notif-morning-time') || '08:00');
  const [notifStreak, setNotifStreak] = useState(() => localStorage.getItem('nook-notif-streak') !== 'false');
  const [notifPomo, setNotifPomo] = useState(() => localStorage.getItem('nook-notif-pomo') !== 'false');

  // Push reminders (Web Push — works even when Nook is closed; distinct
  // from the in-app Notification toggles above, which only fire while a
  // tab is open).
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    let active = true;
    isCurrentlySubscribed().then(v => { if (active) setPushEnabled(v); });
    return () => { active = false; };
  }, []);

  // Email reminders — independent channel from push; same reminders,
  // delivered by the same send-task-reminders Edge Function, just via
  // email instead of (or alongside) a device push.
  const [emailEnabled, setEmailEnabledState] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  useEffect(() => {
    let active = true;
    isEmailRemindersEnabled().then(v => { if (active) setEmailEnabledState(v); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Preferences state
  const [form, setForm] = useState(settings);
  const [weekStart, setWeekStart] = useState(() => localStorage.getItem('nook-week-start') || 'monday');

  // Save effects
  useEffect(() => {
    localStorage.setItem('nook-profile-name', profileName);
    localStorage.setItem('nook-profile-email', profileEmail);
    localStorage.setItem('nook-profile-avatar', avatar);
    if (onUpdateProfileRef.current) onUpdateProfileRef.current(profileName, profileEmail, avatar);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileName, profileEmail, avatar]);
  useEffect(() => { localStorage.setItem('nook-notif-master', notifMaster); }, [notifMaster]);
  useEffect(() => { localStorage.setItem('nook-notif-morning', notifMorning); }, [notifMorning]);
  useEffect(() => { localStorage.setItem('nook-notif-morning-time', morningTime); }, [morningTime]);
  useEffect(() => { localStorage.setItem('nook-notif-streak', notifStreak); }, [notifStreak]);
  useEffect(() => { localStorage.setItem('nook-notif-pomo', notifPomo); }, [notifPomo]);
  useEffect(() => { localStorage.setItem('nook-week-start', weekStart); }, [weekStart]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const applyPreset = preset => setForm(f => ({ ...f, ...preset.vals }));

  const submitSettings = () => {
    onSaveSettings({
      ...form,
      focusDuration:  Math.max(1, Math.min(480, Number(form.focusDuration)  || 25)),
      shortDuration:  Math.max(1, Math.min(60,  Number(form.shortDuration)  || 5)),
      longDuration:   Math.max(1, Math.min(120, Number(form.longDuration)   || 15)),
      customDuration: Math.max(1, Math.min(480, Number(form.customDuration) || 25)),
    });
    alert('Settings saved!');
  };

  const exportData = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('nook-')) {
        data[k] = localStorage.getItem(k);
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nook-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        onImportData(data);
      } catch (err) {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatar(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert("This browser does not support desktop notification");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Enable notifications in browser settings to get reminders');
      setNotifMaster(false);
    } else {
      setNotifMaster(true);
    }
  };

  const handleMasterNotifToggle = () => {
    if (!notifMaster) {
      requestNotificationPermission();
    } else {
      setNotifMaster(false);
    }
  };

  const handlePushRemindersToggle = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (!pushEnabled) {
        await subscribeToPush();
        setPushEnabled(true);
      } else {
        await unsubscribeFromPush();
        setPushEnabled(false);
      }
    } catch (err) {
      alert(err.message || 'Could not update reminder settings.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleEmailRemindersToggle = async () => {
    if (emailBusy) return;
    setEmailBusy(true);
    try {
      const next = !emailEnabled;
      await setEmailRemindersEnabled(next);
      setEmailEnabledState(next);
    } catch (err) {
      alert(err.message || 'Could not update reminder settings.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('Log out of Nook?\n\nYou\'ll be signed out (and any Google connections disconnected). Your local data stays saved on this device.')) return;
    try { disconnectGoogleTasks(); } catch {}
    try { if (gcalConnected) onDisconnectGCal(); } catch {}
    localStorage.setItem('nook_sync_enabled', 'false');
    try { if (isAuthConfigured) await supabase.auth.signOut(); } catch {}
    window.location.reload();
  };

  const calculateStorage = () => {
    let total = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += ((localStorage[key].length + key.length) * 2);
      }
    }
    return (total / 1024).toFixed(2);
  };

  return (
    <div className="settings-view">

      {/* ── Hero header ── */}
      <div className="page-hero settings-hero" style={{ padding: '2px 2px 4px' }}>
        <div className="page-hero-left" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="page-hero-badge" aria-hidden="true" style={{ width: 46, height: 46, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 14, color: '#fff', background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)', boxShadow: '0 10px 24px -8px var(--accent), inset 0 1px 0 rgba(255,255,255,0.28)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div className="page-hero-text" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <h2 className="page-hero-title" style={{ margin: 0, fontSize: '1.9rem', fontWeight: 850, lineHeight: 1, letterSpacing: '-0.035em' }}>Settings</h2>
            <span className="page-hero-sub" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Profile, notifications, sync & preferences</span>
          </div>
        </div>
      </div>

      <div className="settings-grid">

      {/* Profile Section */}
      <section className="settings-card">
        <h3 className="settings-card-title">Profile</h3>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="avatar-picker" style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ width: 62, height: 62, borderRadius: '50%', background: 'var(--surface-nested)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.1rem', overflow: 'hidden', border: '2px solid var(--accent)', boxShadow: '0 4px 12px var(--accent-glow)' }}>
              {avatar.startsWith('data:image') ? <img src={avatar} alt="avatar" style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : avatar}
            </div>
            <label className="upload-link" style={{ display: 'block', marginTop: 7, fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-light)', cursor: 'pointer' }}>
              Upload
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
            </label>
          </div>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="set-field-lbl">Name</label>
              <div style={{ position: 'relative' }}>
                <input type="text" maxLength={20} className="form-inp profile-input" style={{ width: '100%', boxSizing: 'border-box', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', padding: '9px 44px 9px 12px', fontSize: '0.88rem', borderRadius: 10 }} value={profileName} onChange={e => setProfileName(e.target.value.slice(0, 20))} placeholder="What should we call you?" />
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: profileName.length >= 20 ? 'var(--color-red)' : 'var(--text-muted)', pointerEvents: 'none', fontWeight: 600 }}>{profileName.length}/20</div>
              </div>
            </div>
            <div>
              <label className="set-field-lbl">Email</label>
              <div style={{ position: 'relative' }}>
                <input type="email" maxLength={50} className="form-inp profile-input" style={{ width: '100%', boxSizing: 'border-box', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', padding: '9px 44px 9px 12px', fontSize: '0.88rem', borderRadius: 10 }} value={profileEmail} onChange={e => setProfileEmail(e.target.value.slice(0, 50))} placeholder="yourname@example.com" />
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: profileEmail.length >= 50 ? 'var(--color-red)' : 'var(--text-muted)', pointerEvents: 'none', fontWeight: 600 }}>{profileEmail.length}/50</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <label className="set-field-lbl" style={{ marginBottom: 10 }}>Choose Emoji</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EMOJI_AVATARS.map(em => (
              <button key={em} onClick={() => setAvatar(em)} style={{ background: avatar === em ? 'var(--accent-glow)' : 'var(--surface-nested)', border: avatar === em ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 12, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', cursor: 'pointer', transition: 'all 0.18s var(--ease-spring)', boxShadow: avatar === em ? '0 4px 12px var(--accent-glow)' : 'none' }}>
                {em}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Notifications Section */}
      <section className="settings-card">
        <h3 className="settings-card-title">Notifications</h3>

        <label className="set-row master-toggle" onClick={handleMasterNotifToggle} style={{ background: 'var(--accent-glow)', borderColor: 'var(--border-accent)' }}>
          <div>
            <div className="set-row-lbl">Enable Notifications</div>
            <div className="set-row-sub">Master switch for all push notifications</div>
          </div>
          <div className="toggle-track" data-on={notifMaster ? 'true' : 'false'} style={{ flexShrink: 0 }}>
            <div className="toggle-thumb" />
          </div>
        </label>

        <div style={{ opacity: notifMaster ? 1 : 0.5, pointerEvents: notifMaster ? 'auto' : 'none', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <div className="set-row" style={{ cursor: 'default' }}>
            <div>
              <div className="set-row-lbl">Morning Briefing</div>
              <div className="set-row-sub">Daily summary of pending trackers</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginLeft: 'auto' }}>
              <input type="time" className="form-inp" value={morningTime} onChange={e => setMorningTime(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, background: 'var(--bg-surface)', width: 118 }} />
              <div className="toggle-track" onClick={() => setNotifMorning(!notifMorning)} data-on={notifMorning ? 'true' : 'false'} style={{ cursor: 'pointer', flexShrink: 0 }}><div className="toggle-thumb" /></div>
            </div>
          </div>

          <label className="set-row" onClick={() => setNotifStreak(!notifStreak)}>
            <div>
              <div className="set-row-lbl">Streak at-risk alerts (8 PM)</div>
              <div className="set-row-sub">Alert if you're about to lose a 3+ day streak</div>
            </div>
            <div className="toggle-track" data-on={notifStreak ? 'true' : 'false'} style={{ flexShrink: 0 }}><div className="toggle-thumb" /></div>
          </label>

          <label className="set-row" onClick={() => setNotifPomo(!notifPomo)}>
            <div>
              <div className="set-row-lbl">Pomodoro timer alerts</div>
              <div className="set-row-sub">Notify when focus/break sessions end</div>
            </div>
            <div className="toggle-track" data-on={notifPomo ? 'true' : 'false'} style={{ flexShrink: 0 }}><div className="toggle-thumb" /></div>
          </label>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

        {isPushSupported() ? (
          <label className="set-row" onClick={handlePushRemindersToggle} style={{ opacity: pushBusy ? 0.6 : 1, pointerEvents: pushBusy ? 'none' : 'auto' }}>
            <div>
              <div className="set-row-lbl">Push reminders</div>
              <div className="set-row-sub">Task &amp; event reminders — delivered even when Nook is closed</div>
            </div>
            <div className="toggle-track" data-on={pushEnabled ? 'true' : 'false'} style={{ flexShrink: 0 }}><div className="toggle-thumb" /></div>
          </label>
        ) : (
          <div className="set-row" style={{ cursor: 'default', opacity: 0.6 }}>
            <div>
              <div className="set-row-lbl">Push reminders</div>
              <div className="set-row-sub">Not supported in this browser</div>
            </div>
          </div>
        )}

        <label className="set-row" onClick={handleEmailRemindersToggle} style={{ opacity: emailBusy ? 0.6 : 1, pointerEvents: emailBusy ? 'none' : 'auto', marginTop: 8 }}>
          <div>
            <div className="set-row-lbl">Email reminders</div>
            <div className="set-row-sub">Sent to your account's sign-in email — independent of push, works on any device</div>
          </div>
          <div className="toggle-track" data-on={emailEnabled ? 'true' : 'false'} style={{ flexShrink: 0 }}><div className="toggle-thumb" /></div>
        </label>
      </section>

      {/* Google Tasks Sync Section */}
      <section className="settings-card">
        <h3 className="settings-card-title">Google Tasks Sync</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 14 }}>
          Sync tasks with Google Tasks. Works on this device only (state lives in localStorage).
        </p>

        {syncStatus === 'Not connected' ? (
          <button
            type="button"
            className="primary-btn"
            style={{ background: '#4285F4', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 11, fontWeight: 600, fontSize: '0.86rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(66,133,244,0.25)' }}
            onClick={connectGoogleTasks}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#fff"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#fff"/>
            </svg>
            Connect Google Tasks
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <style>{`@keyframes customSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            <label className="set-row" onClick={() => onSyncToggle(localStorage.getItem('nook_sync_enabled') !== 'true')}>
              <div>
                <div className="set-row-lbl">Sync tasks with Google Tasks</div>
                <div className="set-row-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {syncStatus === 'Syncing...' && (
                    <svg style={{ animation: 'customSpin 1s linear infinite', width: 12, height: 12, color: 'var(--accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
                      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span>Status: {syncStatus}</span>
                </div>
              </div>
              <div className="toggle-track" data-on={localStorage.getItem('nook_sync_enabled') === 'true' ? 'true' : 'false'} style={{ flexShrink: 0 }}><div className="toggle-thumb" /></div>
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary-btn"
                style={{ background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, fontWeight: 600, fontSize: '0.84rem', border: 'none', cursor: 'pointer' }}
                disabled={syncStatus === 'Syncing...'}
                onClick={onSyncNow}
              >
                {syncStatus === 'Syncing...' ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ color: 'var(--color-red)', border: '1px solid #ef4444', background: 'rgba(239,68,68,0.06)', padding: '9px 18px', borderRadius: 10, fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer' }}
                onClick={() => { disconnectGoogleTasks(); onDisconnect(); }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Google Calendar Sync Section */}
      <section className="settings-card">
        <h3 className="settings-card-title">Google Calendar Sync</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 14 }}>
          Connect to see events on the Nook calendar. Manage them from the <strong style={{ color: 'var(--text-primary)' }}>Calendar</strong> tab.
        </p>

        {!gcalConnected ? (
          <button
            type="button"
            className="primary-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 11, fontWeight: 600, fontSize: '0.86rem', border: 'none', cursor: 'pointer', background: '#4285F4', color: '#fff', boxShadow: '0 4px 12px rgba(66,133,244,0.25)' }}
            onClick={onConnectGCal}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="17" rx="2" stroke="#fff" strokeWidth="1.5"/>
              <path d="M16 2v4M8 2v4M3 9h18" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
              <text x="12" y="18" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">G</text>
            </svg>
            Connect Google Calendar
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="set-row" style={{ cursor: 'default', background: 'rgba(66,133,244,0.08)', borderColor: 'rgba(66,133,244,0.24)', justifyContent: 'flex-start', gap: 11 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-green)', boxShadow: '0 0 6px rgba(34,197,94,0.5)', flexShrink: 0 }} />
              <div>
                <div className="set-row-lbl">Google Calendar connected</div>
                <div className="set-row-sub">Events sync when you open the Calendar tab.</div>
              </div>
            </div>
            <button
              type="button"
              className="secondary-btn"
              style={{ alignSelf: 'flex-start', color: 'var(--color-red)', border: '1px solid #ef4444', background: 'rgba(239,68,68,0.06)', padding: '9px 18px', borderRadius: 10, fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer' }}
              onClick={() => {
                if (window.confirm('Disconnect Google Calendar?\n\nThis will hide all Google Calendar events from Nook. You can reconnect at any time.')) {
                  onDisconnectGCal();
                }
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </section>

      {/* App Preferences */}
      <section className="settings-card">
        <h3 className="settings-card-title">App Preferences</h3>

        <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="set-field-lbl">Theme</label>
            <Select
              className="form-inp"
              style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: 10 }}
              value={theme}
              onChange={e => onSetTheme(e.target.value)}
              options={[
                { value: 'dark', label: 'Dark Mode' },
                { value: 'light', label: 'Light Mode' },
              ]}
            />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="set-field-lbl">Week starts on</label>
            <Select
              className="form-inp"
              style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: 10 }}
              value={weekStart}
              onChange={e => setWeekStart(e.target.value)}
              options={[
                { value: 'monday', label: 'Monday' },
                { value: 'sunday', label: 'Sunday' },
              ]}
            />
          </div>
        </div>

        <div className="form-grp" style={{ marginBottom: 18 }}>
          <label className="set-field-lbl">Timer Presets</label>
          <div className="preset-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
            {PRESETS.map(p => (
              <button key={p.label} type="button" className="preset-btn" onClick={() => applyPreset(p)} style={{ padding: '10px 12px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface-nested)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', transition: 'all 0.18s var(--ease-spring)' }}>
                <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>{p.label}</span>
                <small style={{ color: 'var(--accent-light)', fontWeight: 600, fontSize: '0.72rem' }}>{p.sub}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="form-grp" style={{ marginBottom: 18 }}>
          <label className="set-field-lbl">Timer Durations (minutes)</label>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div className="form-grp">
              <label className="sub-label" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 5, display: 'block', fontWeight: 600 }}>Focus</label>
              <input type="number" className="form-inp" style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: 10, boxSizing: 'border-box' }} value={form.focusDuration} onChange={e => set('focusDuration', e.target.value)} min="1" max="480" />
            </div>
            <div className="form-grp">
              <label className="sub-label" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 5, display: 'block', fontWeight: 600 }}>Short</label>
              <input type="number" className="form-inp" style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: 10, boxSizing: 'border-box' }} value={form.shortDuration} onChange={e => set('shortDuration', e.target.value)} min="1" max="60" />
            </div>
            <div className="form-grp">
              <label className="sub-label" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 5, display: 'block', fontWeight: 600 }}>Long</label>
              <input type="number" className="form-inp" style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem', borderRadius: 10, boxSizing: 'border-box' }} value={form.longDuration} onChange={e => set('longDuration', e.target.value)} min="1" max="120" />
            </div>
          </div>
        </div>

        <button className="primary-btn" style={{ padding: '10px 20px', borderRadius: 11, fontWeight: 700, fontSize: '0.86rem', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }} onClick={submitSettings}>Save Timer Preferences</button>
      </section>

      {/* Data Management */}
      <section className="settings-card">
        <h3 className="settings-card-title">Data Management</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 14 }}>
          Everything is stored locally in your browser ({calculateStorage()} KB used).
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="secondary-btn" style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-nested)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={exportData}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>

          <label className="secondary-btn" style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-nested)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>

          <button className="secondary-btn" style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.06)', color: 'var(--color-red)', fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={onClearData}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Clear All
          </button>
        </div>
      </section>

      {/* About */}
      <section className="settings-card" style={{ textAlign: 'center', padding: '22px 20px', background: 'transparent', boxShadow: 'none' }}>
        <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>🌱</div>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Nook v3.0</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 6 }}>A beautiful Pomodoro timer and task manager.</p>
        <a href="mailto:bugs@nook.app" style={{ color: 'var(--accent-light)', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: 12 }}>Report a bug</a>
      </section>

      </div>{/* end settings-grid */}

      {/* ── Log out ── */}
      <button type="button" className="settings-logout-btn" onClick={handleLogout}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Log Out
      </button>
    </div>
  );
});
