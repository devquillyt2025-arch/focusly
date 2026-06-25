import React, { useState, useEffect } from 'react';
import { connectGoogleTasks, disconnectGoogleTasks } from '../utils/googleTasksSync';

const PRESETS = [
  { label: 'Standard',  sub: '25/5/15',  vals: { focusDuration: 25, shortDuration: 5,  longDuration: 15 } },
  { label: 'Short',     sub: '20/3/10',  vals: { focusDuration: 20, shortDuration: 3,  longDuration: 10 } },
  { label: 'Long',      sub: '50/10/20', vals: { focusDuration: 50, shortDuration: 10, longDuration: 20 } },
  { label: 'Deep Work', sub: '90/15/30', vals: { focusDuration: 90, shortDuration: 15, longDuration: 30 } },
];

const EMOJI_AVATARS = ['😎', '🤓', '👩‍💻', '👨‍🚀', '🦄', '👻'];

export default function SettingsView({ settings, onSaveSettings, theme, onSetTheme, onClearData, onImportData, syncStatus, onSyncToggle, onDisconnect, onSyncNow }) {
  // Profile state
  const [profileName, setProfileName] = useState(() => localStorage.getItem('focusly-profile-name') || '');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('focusly-profile-avatar') || '😎');

  // Notifications state
  const [notifMaster, setNotifMaster] = useState(() => localStorage.getItem('focusly-notif-master') !== 'false');
  const [notifMorning, setNotifMorning] = useState(() => localStorage.getItem('focusly-notif-morning') !== 'false');
  const [morningTime, setMorningTime] = useState(() => localStorage.getItem('focusly-notif-morning-time') || '08:00');
  const [notifStreak, setNotifStreak] = useState(() => localStorage.getItem('focusly-notif-streak') !== 'false');
  const [notifPomo, setNotifPomo] = useState(() => localStorage.getItem('focusly-notif-pomo') !== 'false');

  // Preferences state
  const [form, setForm] = useState(settings);
  const [weekStart, setWeekStart] = useState(() => localStorage.getItem('focusly-week-start') || 'monday');

  // Save effects
  useEffect(() => { localStorage.setItem('focusly-profile-name', profileName); }, [profileName]);
  useEffect(() => { localStorage.setItem('focusly-profile-avatar', avatar); }, [avatar]);
  useEffect(() => { localStorage.setItem('focusly-notif-master', notifMaster); }, [notifMaster]);
  useEffect(() => { localStorage.setItem('focusly-notif-morning', notifMorning); }, [notifMorning]);
  useEffect(() => { localStorage.setItem('focusly-notif-morning-time', morningTime); }, [morningTime]);
  useEffect(() => { localStorage.setItem('focusly-notif-streak', notifStreak); }, [notifStreak]);
  useEffect(() => { localStorage.setItem('focusly-notif-pomo', notifPomo); }, [notifPomo]);
  useEffect(() => { localStorage.setItem('focusly-week-start', weekStart); }, [weekStart]);

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
      if (k.startsWith('focusly-')) {
        data[k] = localStorage.getItem(k);
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focusly-data-${new Date().toISOString().split('T')[0]}.json`;
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
    <div className="settings-view" style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 40 }}>
      
      {/* Profile Section */}
      <section className="settings-section">
        <h3>Profile</h3>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 16 }}>
          <div className="avatar-picker" style={{ textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: 40, background: 'var(--c-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', overflow: 'hidden', border: '2px solid #6366f1' }}>
              {avatar.startsWith('data:image') ? <img src={avatar} alt="avatar" style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : avatar}
            </div>
            <label style={{ display: 'block', marginTop: 8, fontSize: '0.8rem', color: '#6366f1', cursor: 'pointer' }}>
              Upload Image
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-lbl">Name</label>
            <input type="text" className="form-inp" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="What should we call you?" />
            
            <label className="form-lbl" style={{ marginTop: 16 }}>Choose Emoji</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {EMOJI_AVATARS.map(em => (
                <button key={em} onClick={() => setAvatar(em)} style={{ background: avatar === em ? '#6366f1' : 'var(--c-bg-card)', border: 'none', borderRadius: 8, padding: 8, fontSize: '1.2rem', cursor: 'pointer' }}>
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Notifications Section */}
      <section className="settings-section">
        <h3>Notifications</h3>
        
        <label className="toggle-row" onClick={handleMasterNotifToggle} style={{ background: 'rgba(99, 102, 241, 0.1)', padding: 16, borderRadius: 12 }}>
          <div className="toggle-track" data-on={notifMaster ? 'true' : 'false'}>
            <div className="toggle-thumb" />
          </div>
          <div>
            <div className="toggle-lbl">Enable Notifications</div>
            <div className="toggle-sub">Master switch for all push notifications</div>
          </div>
        </label>

        <div style={{ opacity: notifMaster ? 1 : 0.5, pointerEvents: notifMaster ? 'auto' : 'none', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--c-bg-card)', padding: '12px 16px', borderRadius: 8 }}>
            <div>
              <div className="toggle-lbl">Morning Briefing</div>
              <div className="toggle-sub">Daily summary of pending trackers</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input type="time" className="form-inp" value={morningTime} onChange={e => setMorningTime(e.target.value)} style={{ padding: '4px 8px' }} />
              <div className="toggle-track" onClick={() => setNotifMorning(!notifMorning)} data-on={notifMorning ? 'true' : 'false'} style={{ cursor: 'pointer' }}><div className="toggle-thumb" /></div>
            </div>
          </div>

          <label className="toggle-row" onClick={() => setNotifStreak(!notifStreak)} style={{ background: 'var(--c-bg-card)', padding: '12px 16px', borderRadius: 8, margin: 0 }}>
            <div className="toggle-track" data-on={notifStreak ? 'true' : 'false'}><div className="toggle-thumb" /></div>
            <div>
              <div className="toggle-lbl">Streak at-risk alerts (8 PM)</div>
              <div className="toggle-sub">Alert if you're about to lose a 3+ day streak</div>
            </div>
          </label>

          <label className="toggle-row" onClick={() => setNotifPomo(!notifPomo)} style={{ background: 'var(--c-bg-card)', padding: '12px 16px', borderRadius: 8, margin: 0 }}>
            <div className="toggle-track" data-on={notifPomo ? 'true' : 'false'}><div className="toggle-thumb" /></div>
            <div>
              <div className="toggle-lbl">Pomodoro timer alerts</div>
              <div className="toggle-sub">Notify when focus/break sessions end</div>
            </div>
          </label>
        </div>
      </section>

      {/* Google Tasks Sync Section */}
      <section className="settings-section">
        <h3>Google Tasks Sync</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 16 }}>
          Sync your Focusly tasks with Google Tasks. Note: This sync only works on this device/browser since sync state lives in localStorage.
        </p>
        
        {syncStatus === 'Not connected' ? (
          <div>
            <button
              type="button"
              className="primary-btn"
              style={{ background: '#4285F4', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              onClick={connectGoogleTasks}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Connect Google Tasks
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <style>{`@keyframes customSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            <label className="toggle-row" onClick={() => onSyncToggle(localStorage.getItem('focusly_sync_enabled') !== 'true')} style={{ background: 'var(--c-bg-card)', padding: '12px 16px', borderRadius: 8, margin: 0 }}>
              <div className="toggle-track" data-on={localStorage.getItem('focusly_sync_enabled') === 'true' ? 'true' : 'false'}><div className="toggle-thumb" /></div>
              <div>
                <div className="toggle-lbl">Sync tasks with Google Tasks</div>
                <div className="toggle-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  {syncStatus === 'Syncing...' && (
                    <svg style={{ animation: 'customSpin 1s linear infinite', width: 14, height: 14, color: '#6366f1' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
                      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span>Status: {syncStatus}</span>
                </div>
              </div>
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="primary-btn"
                style={{ background: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                disabled={syncStatus === 'Syncing...'}
                onClick={onSyncNow}
              >
                {syncStatus === 'Syncing...' ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                onClick={() => {
                  disconnectGoogleTasks();
                  onDisconnect();
                }}
              >
                Disconnect Google Tasks
              </button>
            </div>
          </div>
        )}
      </section>

      {/* App Preferences */}
      <section className="settings-section">
        <h3>App Preferences</h3>
        
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label className="form-lbl">Theme</label>
            <select className="form-inp" value={theme} onChange={e => onSetTheme(e.target.value)}>
              <option value="dark">Dark Mode</option>
              <option value="light">Light Mode</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-lbl">Week starts on</label>
            <select className="form-inp" value={weekStart} onChange={e => setWeekStart(e.target.value)}>
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </select>
          </div>
        </div>

        <div className="form-grp">
          <label>Timer Presets</label>
          <div className="preset-grid">
            {PRESETS.map(p => (
              <button key={p.label} type="button" className="preset-btn" onClick={() => applyPreset(p)}>
                <span>{p.label}</span>
                <small>{p.sub}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="form-grp">
          <label>Timer Durations (minutes)</label>
          <div className="form-row">
            <div className="form-grp">
              <label className="sub-label">Focus</label>
              <input type="number" className="form-inp" value={form.focusDuration} onChange={e => set('focusDuration', e.target.value)} min="1" max="480" />
            </div>
            <div className="form-grp">
              <label className="sub-label">Short Break</label>
              <input type="number" className="form-inp" value={form.shortDuration} onChange={e => set('shortDuration', e.target.value)} min="1" max="60" />
            </div>
            <div className="form-grp">
              <label className="sub-label">Long Break</label>
              <input type="number" className="form-inp" value={form.longDuration} onChange={e => set('longDuration', e.target.value)} min="1" max="120" />
            </div>
          </div>
        </div>
        
        <div style={{ marginTop: 16 }}>
          <button className="primary-btn" onClick={submitSettings}>Save Timer Preferences</button>
        </div>
      </section>

      {/* Data Management */}
      <section className="settings-section">
        <h3>Data Management</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 16 }}>
          Focusly is entirely local. Your data stays in your browser ({calculateStorage()} KB used).
        </p>
        
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="secondary-btn" onClick={exportData}>💾 Export All Data</button>
          
          <label className="secondary-btn" style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center' }}>
            📥 Import Data
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
          
          <button className="secondary-btn" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={onClearData}>
            🗑 Clear All Data
          </button>
        </div>
      </section>

      {/* About */}
      <section className="settings-section" style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🌱</div>
        <div style={{ fontWeight: 600, fontSize: '1.2rem' }}>Focusly v3.0</div>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: 8 }}>A beautiful Pomodoro timer and task manager.</p>
        <a href="mailto:bugs@focusly.app" style={{ color: '#6366f1', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-block', marginTop: 16 }}>Report a bug</a>
      </section>
    </div>
  );
}
