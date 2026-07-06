import React, { useState, useEffect, useRef } from 'react';
import { connectGoogleTasks, disconnectGoogleTasks } from '../utils/googleTasksSync';
import Select from './Select';

const PRESETS = [
  { label: 'Standard',  sub: '25/5/15',  vals: { focusDuration: 25, shortDuration: 5,  longDuration: 15 } },
  { label: 'Short',     sub: '20/3/10',  vals: { focusDuration: 20, shortDuration: 3,  longDuration: 10 } },
  { label: 'Long',      sub: '50/10/20', vals: { focusDuration: 50, shortDuration: 10, longDuration: 20 } },
  { label: 'Deep Work', sub: '90/15/30', vals: { focusDuration: 90, shortDuration: 15, longDuration: 30 } },
];

const EMOJI_AVATARS = ['😎', '🤓', '👩‍💻', '👨‍🚀', '🦄', '👻'];

export default function SettingsView({ settings, onSaveSettings, theme, onSetTheme, onClearData, onImportData, syncStatus, onSyncToggle, onDisconnect, onSyncNow, onUpdateProfile, initialProfileName, initialProfileEmail, initialProfileAvatar, gcalConnected, onConnectGCal, onDisconnectGCal }) {
  // Profile state — seed from App.jsx's already-resolved state (same values the header shows)
  const [profileName, setProfileName] = useState(
    () => initialProfileName || localStorage.getItem('focusly-profile-name') || 'Productivity User'
  );
  const [profileEmail, setProfileEmail] = useState(
    () => initialProfileEmail || localStorage.getItem('focusly-profile-email') || ''
  );
  const [avatar, setAvatar] = useState(
    () => initialProfileAvatar || localStorage.getItem('focusly-profile-avatar') || '😎'
  );

  // Keep a stable ref to onUpdateProfile so the save effect doesn't re-fire when the parent re-renders
  const onUpdateProfileRef = useRef(onUpdateProfile);
  useEffect(() => { onUpdateProfileRef.current = onUpdateProfile; });

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
  useEffect(() => {
    localStorage.setItem('focusly-profile-name', profileName);
    localStorage.setItem('focusly-profile-email', profileEmail);
    localStorage.setItem('focusly-profile-avatar', avatar);
    if (onUpdateProfileRef.current) onUpdateProfileRef.current(profileName, profileEmail, avatar);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileName, profileEmail, avatar]);
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
    <div className="settings-view">
      
      {/* Profile Section */}
      <section className="settings-card">
        <h3 className="settings-card-title">Profile</h3>
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', marginTop: 16, flexWrap: 'wrap' }}>
          <div className="avatar-picker" style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ width: 88, height: 88, borderRadius: 44, background: 'var(--c-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.2rem', overflow: 'hidden', border: '2px solid #6366f1', boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }}>
              {avatar.startsWith('data:image') ? <img src={avatar} alt="avatar" style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : avatar}
            </div>
            <label className="upload-link" style={{ display: 'block', marginTop: 10, fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', transition: 'all 0.2s' }}>
              Upload Image
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
            </label>
          </div>
          <div style={{ flex: 1, minWidth: 260, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <label className="form-lbl" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Name</label>
              <div style={{ position: 'relative' }}>
                <input type="text" maxLength={20} className="form-inp profile-input" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', padding: '12px 16px', fontSize: '0.95rem', borderRadius: 12, paddingRight: '48px' }} value={profileName} onChange={e => setProfileName(e.target.value.slice(0, 20))} placeholder="What should we call you?" />
                <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: profileName.length >= 20 ? 'var(--color-red)' : 'var(--text-muted)', pointerEvents: 'none', fontWeight: 600 }}>{profileName.length}/20</div>
              </div>
            </div>
            <div>
              <label className="form-lbl" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Email</label>
              <div style={{ position: 'relative' }}>
                <input type="email" maxLength={50} className="form-inp profile-input" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', padding: '12px 16px', fontSize: '0.95rem', borderRadius: 12, paddingRight: '48px' }} value={profileEmail} onChange={e => setProfileEmail(e.target.value.slice(0, 50))} placeholder="yourname@example.com" />
                <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: profileEmail.length >= 50 ? 'var(--color-red)' : 'var(--text-muted)', pointerEvents: 'none', fontWeight: 600 }}>{profileEmail.length}/50</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <label className="form-lbl" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14, display: 'block' }}>Choose Emoji</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 14 }}>
            {EMOJI_AVATARS.map(em => (
              <button key={em} onClick={() => setAvatar(em)} style={{ background: avatar === em ? 'rgba(99,102,241,0.15)' : 'var(--c-bg-card)', border: avatar === em ? '2px solid #6366f1' : '2px solid transparent', borderRadius: 16, width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: avatar === em ? '0 4px 12px rgba(99,102,241,0.15)' : 'none' }}>
                {em}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Notifications Section */}
      <section className="settings-card">
        <h3 className="settings-card-title">Notifications</h3>
        
        <label className="toggle-row master-toggle" onClick={handleMasterNotifToggle} style={{ background: 'rgba(99, 102, 241, 0.08)', padding: '20px 24px', borderRadius: 16, border: '1px solid rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
          <div>
            <div className="toggle-lbl" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Enable Notifications</div>
            <div className="toggle-sub" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>Master switch for all push notifications</div>
          </div>
          <div className="toggle-track" data-on={notifMaster ? 'true' : 'false'} style={{ flexShrink: 0 }}>
            <div className="toggle-thumb" />
          </div>
        </label>

        <div style={{ opacity: notifMaster ? 1 : 0.5, pointerEvents: notifMaster ? 'auto' : 'none', display: 'flex', flexDirection: 'column', gap: 20, marginTop: 24, marginLeft: 24, paddingLeft: 20, borderLeft: '2px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--c-bg-card)', padding: '16px 20px', borderRadius: 14, border: '1px solid var(--border)', width: '100%', boxSizing: 'border-box' }}>
            <div>
              <div className="toggle-lbl" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Morning Briefing</div>
              <div className="toggle-sub" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>Daily summary of pending trackers</div>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginLeft: 'auto' }}>
              <input type="time" className="form-inp" value={morningTime} onChange={e => setMorningTime(e.target.value)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, background: 'var(--bg-surface)', width: '140px' }} />
              <div className="toggle-track" onClick={() => setNotifMorning(!notifMorning)} data-on={notifMorning ? 'true' : 'false'} style={{ cursor: 'pointer', flexShrink: 0 }}><div className="toggle-thumb" /></div>
            </div>
          </div>

          <label className="toggle-row" onClick={() => setNotifStreak(!notifStreak)} style={{ background: 'var(--c-bg-card)', padding: '16px 20px', borderRadius: 14, border: '1px solid var(--border)', margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
            <div>
              <div className="toggle-lbl" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Streak at-risk alerts (8 PM)</div>
              <div className="toggle-sub" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>Alert if you're about to lose a 3+ day streak</div>
            </div>
            <div className="toggle-track" data-on={notifStreak ? 'true' : 'false'} style={{ flexShrink: 0 }}><div className="toggle-thumb" /></div>
          </label>

          <label className="toggle-row" onClick={() => setNotifPomo(!notifPomo)} style={{ background: 'var(--c-bg-card)', padding: '16px 20px', borderRadius: 14, border: '1px solid var(--border)', margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
            <div>
              <div className="toggle-lbl" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Pomodoro timer alerts</div>
              <div className="toggle-sub" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>Notify when focus/break sessions end</div>
            </div>
            <div className="toggle-track" data-on={notifPomo ? 'true' : 'false'} style={{ flexShrink: 0 }}><div className="toggle-thumb" /></div>
          </label>
        </div>
      </section>

      {/* Google Tasks Sync Section */}
      <section className="settings-card">
        <h3 className="settings-card-title">Google Tasks Sync</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: 24 }}>
          Sync your My Workspace tasks with Google Tasks. Note: This sync only works on this device/browser since sync state lives in localStorage.
        </p>
        
        {syncStatus === 'Not connected' ? (
          <div>
            <button
              type="button"
              className="primary-btn"
              style={{ background: '#4285F4', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 24px', borderRadius: 14, fontWeight: 600, fontSize: '0.95rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(66,133,244,0.2)' }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <style>{`@keyframes customSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            <label className="toggle-row" onClick={() => onSyncToggle(localStorage.getItem('focusly_sync_enabled') !== 'true')} style={{ background: 'var(--c-bg-card)', padding: '16px 20px', borderRadius: 14, border: '1px solid var(--border)', margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div>
                <div className="toggle-lbl" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Sync tasks with Google Tasks</div>
                <div className="toggle-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {syncStatus === 'Syncing...' && (
                    <svg style={{ animation: 'customSpin 1s linear infinite', width: 14, height: 14, color: 'var(--accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
                      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span>Status: {syncStatus}</span>
                </div>
              </div>
              <div className="toggle-track" data-on={localStorage.getItem('focusly_sync_enabled') === 'true' ? 'true' : 'false'} style={{ flexShrink: 0 }}><div className="toggle-thumb" /></div>
            </label>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary-btn"
                style={{ background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }}
                disabled={syncStatus === 'Syncing...'}
                onClick={onSyncNow}
              >
                {syncStatus === 'Syncing...' ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ color: 'var(--color-red)', border: '1px solid #ef4444', background: 'rgba(239,68,68,0.05)', padding: '12px 24px', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}
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

      {/* Google Calendar Sync Section */}
      <section className="settings-card">
        <h3 className="settings-card-title">Google Calendar Sync</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: 24 }}>
          Connect Google Calendar to see your events on the Focusly calendar. You can manage events from the <strong style={{ color: 'var(--text-primary)' }}>Calendar</strong> tab.
        </p>

        {!gcalConnected ? (
          <div>
            <button
              type="button"
              className="primary-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 24px', borderRadius: 14, fontWeight: 600, fontSize: '0.95rem', border: 'none', cursor: 'pointer', background: '#4285F4', color: '#fff', boxShadow: '0 4px 12px rgba(66,133,244,0.2)' }}
              onClick={onConnectGCal}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="17" rx="2" stroke="#fff" strokeWidth="1.5"/>
                <path d="M16 2v4M8 2v4M3 9h18" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                <text x="12" y="18" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">G</text>
              </svg>
              Connect Google Calendar
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: 'rgba(66,133,244,0.07)', border: '1px solid rgba(66,133,244,0.2)', borderRadius: 14 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-green)', boxShadow: '0 0 6px rgba(34,197,94,0.5)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Google Calendar connected</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 3 }}>Events sync automatically when you open the Calendar tab.</div>
              </div>
            </div>
            {/* Disconnect */}
            <div>
              <button
                type="button"
                className="secondary-btn"
                style={{ color: 'var(--color-red)', border: '1px solid #ef4444', background: 'rgba(239,68,68,0.05)', padding: '12px 24px', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => {
                  if (window.confirm('Disconnect Google Calendar?\n\nThis will hide all Google Calendar events from Focusly. You can reconnect at any time.')) {
                    onDisconnectGCal();
                  }
                }}
              >
                Disconnect Google Calendar
              </button>
            </div>
          </div>
        )}
      </section>

      {/* App Preferences */}
      <section className="settings-card">
        <h3 className="settings-card-title">App Preferences</h3>
        
        <div style={{ display: 'flex', gap: 24, marginTop: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="form-lbl" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Theme</label>
            <Select 
              className="form-inp" 
              style={{ width: '100%', padding: '12px 16px', fontSize: '0.95rem', borderRadius: 12 }} 
              value={theme} 
              onChange={e => onSetTheme(e.target.value)}
              options={[
                { value: 'dark', label: 'Dark Mode' },
                { value: 'light', label: 'Light Mode' },
              ]}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="form-lbl" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Week starts on</label>
            <Select 
              className="form-inp" 
              style={{ width: '100%', padding: '12px 16px', fontSize: '0.95rem', borderRadius: 12 }} 
              value={weekStart} 
              onChange={e => setWeekStart(e.target.value)}
              options={[
                { value: 'monday', label: 'Monday' },
                { value: 'sunday', label: 'Sunday' },
              ]}
            />
          </div>
        </div>

        <div className="form-grp" style={{ marginBottom: 28 }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, display: 'block' }}>Timer Presets</label>
          <div className="preset-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {PRESETS.map(p => (
              <button key={p.label} type="button" className="preset-btn" onClick={() => applyPreset(p)} style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--c-bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', transition: 'all 0.2s' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{p.label}</span>
                <small style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.78rem' }}>{p.sub}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="form-grp" style={{ marginBottom: 28 }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, display: 'block' }}>Timer Durations (minutes)</label>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
            <div className="form-grp">
              <label className="sub-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block', fontWeight: 600 }}>Focus</label>
              <input type="number" className="form-inp" style={{ width: '100%', padding: '12px 16px', fontSize: '0.95rem', borderRadius: 12 }} value={form.focusDuration} onChange={e => set('focusDuration', e.target.value)} min="1" max="480" />
            </div>
            <div className="form-grp">
              <label className="sub-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block', fontWeight: 600 }}>Short Break</label>
              <input type="number" className="form-inp" style={{ width: '100%', padding: '12px 16px', fontSize: '0.95rem', borderRadius: 12 }} value={form.shortDuration} onChange={e => set('shortDuration', e.target.value)} min="1" max="60" />
            </div>
            <div className="form-grp">
              <label className="sub-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block', fontWeight: 600 }}>Long Break</label>
              <input type="number" className="form-inp" style={{ width: '100%', padding: '12px 16px', fontSize: '0.95rem', borderRadius: 12 }} value={form.longDuration} onChange={e => set('longDuration', e.target.value)} min="1" max="120" />
            </div>
          </div>
        </div>
        
        <div style={{ marginTop: 8 }}>
          <button className="primary-btn" style={{ padding: '14px 28px', borderRadius: 14, fontWeight: 600, fontSize: '0.95rem', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }} onClick={submitSettings}>Save Timer Preferences</button>
        </div>
      </section>

      {/* Data Management */}
      <section className="settings-card">
        <h3 className="settings-card-title">Data Management</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: 24 }}>
          My Workspace is entirely local. Your data stays in your browser ({calculateStorage()} KB used).
        </p>
        
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <button className="secondary-btn" style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--c-bg-card)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={exportData}>💾 Export All Data</button>
          
          <label className="secondary-btn" style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--c-bg-card)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            📥 Import Data
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
          
          <button className="secondary-btn" style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.05)', color: 'var(--color-red)', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={onClearData}>
            🗑 Clear All Data
          </button>
        </div>
      </section>

      {/* About */}
      <section className="settings-card" style={{ textAlign: 'center', padding: '32px 24px', background: 'transparent', border: 'none', boxShadow: 'none' }}>
        <div style={{ fontSize: '2.2rem', marginBottom: 12 }}>🌱</div>
        <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--text-primary)' }}>My Workspace v3.0</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: 8 }}>A beautiful Pomodoro timer and task manager.</p>
        <a href="mailto:bugs@focusly.app" style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: 16 }}>Report a bug</a>
      </section>
    </div>
  );
}
