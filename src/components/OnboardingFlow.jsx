import React, { useState } from 'react';
import { genId } from '../trackers/trackerUtils';

const FOCUS_AREAS = [
  { id: 'health', icon: '🍎', label: 'Health' },
  { id: 'work', icon: '💼', label: 'Work' },
  { id: 'finance', icon: '💰', label: 'Finance' },
  { id: 'personal', icon: '🧘', label: 'Personal' }
];

const TEMPLATES = {
  health: [
    { name: 'Morning workout', category: 'health', type: 'habit', config: { schedule: 'daily' } },
    { name: 'Drink 2L water', category: 'health', type: 'habit', config: { schedule: 'daily' } },
    { name: 'Sleep 8 hours', category: 'health', type: 'average', config: { targetAverage: 8, unit: 'hours' } }
  ],
  work: [
    { name: 'Deep work session', category: 'work', type: 'habit', config: { schedule: 'weekdays' } },
    { name: 'No social media before noon', category: 'work', type: 'habit', config: { schedule: 'daily' } }
  ],
  finance: [
    { name: 'Log daily expenses', category: 'finance', type: 'habit', config: { schedule: 'daily' } },
    { name: 'Save ₹50000', category: 'finance', type: 'target', config: { targetValue: 50000, unit: '₹' } }
  ],
  personal: [
    { name: 'Read 20 pages', category: 'personal', type: 'habit', config: { schedule: 'daily' } },
    { name: 'Meditate 10 minutes', category: 'personal', type: 'habit', config: { schedule: 'daily' } }
  ]
};

export default function OnboardingFlow({ onComplete }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [areas, setAreas] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const toggleArea = (id) => {
    setAreas(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleFinish = () => {
    localStorage.setItem('focusly-profile-name', name || 'Friend');
    localStorage.setItem('focusly-profile-email', email || `${(name || 'friend').toLowerCase().replace(/\s+/g, '')}@gmail.com`);
    if (selectedTemplate) {
      const tracker = {
        id: genId(),
        ...selectedTemplate,
        description: 'Added from onboarding',
        logs: [],
        createdAt: new Date().toISOString()
      };
      const existing = JSON.parse(localStorage.getItem('focusly-trackers') || '[]');
      localStorage.setItem('focusly-trackers', JSON.stringify([...existing, tracker]));
    }
    
    // Confetti
    if (window.confetti) {
      window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
    
    setTimeout(() => {
      onComplete();
    }, 1500);
  };

  const requestNotif = async () => {
    if ('Notification' in window) {
      const p = await Notification.requestPermission();
      if (p === 'granted') {
        localStorage.setItem('focusly-notif-master', 'true');
        localStorage.setItem('focusly-notif-morning', 'true');
      }
    }
    setStep(6);
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-bg)' }}>
      <div className="onboarding-card" style={{ background: 'var(--c-bg-card)', padding: 40, borderRadius: 24, maxWidth: 500, width: '90%', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
        
        {step === 1 && (
          <div className="fade-in">
            <div style={{ fontSize: '4rem', marginBottom: 16 }}>🌱</div>
            <h1 style={{ marginBottom: 12 }}>Welcome to My Workspace</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>Your all-in-one productivity companion.</p>
            <ul style={{ textAlign: 'left', display: 'inline-block', marginBottom: 40, color: '#e2e8f0' }}>
              <li style={{ marginBottom: 12 }}>🍅 Focus with Pomodoro timers</li>
              <li style={{ marginBottom: 12 }}>📈 Track habits & hit your targets</li>
              <li style={{ marginBottom: 12 }}>📊 Discover insights about your routines</li>
            </ul>
            <button className="primary-btn" style={{ width: '100%' }} onClick={() => setStep(2)}>Get Started</button>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in">
            <h2 style={{ marginBottom: 12 }}>What should we call you?</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Let's personalize your experience.</p>
            <input type="text" className="form-inp" style={{ textAlign: 'center', fontSize: '1.2rem', padding: '16px', marginBottom: 16, width: '100%' }} value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" autoFocus onKeyDown={e => e.key === 'Enter' && name.trim() && setStep(3)} />
            <input type="email" className="form-inp" style={{ textAlign: 'center', fontSize: '1.1rem', padding: '16px', marginBottom: 32, width: '100%' }} value={email} onChange={e => setEmail(e.target.value)} placeholder="yourname@gmail.com" onKeyDown={e => e.key === 'Enter' && name.trim() && setStep(3)} />
            <button className="primary-btn" style={{ width: '100%' }} disabled={!name.trim()} onClick={() => setStep(3)}>Continue</button>
          </div>
        )}

        {step === 3 && (
          <div className="fade-in">
            <h2 style={{ marginBottom: 12 }}>Pick your focus areas</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>What areas of life do you want to track?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
              {FOCUS_AREAS.map(a => (
                <button key={a.id} onClick={() => toggleArea(a.id)} style={{ padding: '20px', borderRadius: 16, background: areas.includes(a.id) ? 'var(--accent)' : 'var(--border)', border: 'none', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>{a.icon}</div>
                  {a.label}
                </button>
              ))}
            </div>
            <button className="primary-btn" style={{ width: '100%' }} disabled={areas.length === 0} onClick={() => setStep(4)}>Continue</button>
          </div>
        )}

        {step === 4 && (
          <div className="fade-in">
            <h2 style={{ marginBottom: 12 }}>Create your first tracker</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Pick a starter template or skip for now.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32, maxHeight: '40vh', overflowY: 'auto', paddingRight: 8 }}>
              {areas.flatMap(a => TEMPLATES[a] || []).map((t, i) => (
                <button key={i} onClick={() => setSelectedTemplate(t)} style={{ padding: '16px', borderRadius: 12, background: selectedTemplate === t ? 'rgba(99, 102, 241, 0.2)' : 'var(--border)', border: selectedTemplate === t ? '1px solid #6366f1' : '1px solid transparent', color: '#fff', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>{t.type} • {t.category}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="secondary-btn" style={{ flex: 1 }} onClick={() => { setSelectedTemplate(null); setStep(5); }}>Skip</button>
              <button className="primary-btn" style={{ flex: 2 }} disabled={!selectedTemplate} onClick={() => setStep(5)}>Add Tracker</button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="fade-in">
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔔</div>
            <h2 style={{ marginBottom: 12 }}>Enable notifications?</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.5 }}>Get a morning briefing and streak reminders so you never miss a day.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="secondary-btn" style={{ flex: 1 }} onClick={() => setStep(6)}>Maybe Later</button>
              <button className="primary-btn" style={{ flex: 2 }} onClick={requestNotif}>Allow Notifications</button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="fade-in">
            <div style={{ fontSize: '4rem', marginBottom: 16 }}>🎉</div>
            <h2 style={{ marginBottom: 12 }}>You're all set!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Let's build some great habits.</p>
            <button className="primary-btn" style={{ width: '100%' }} onClick={handleFinish}>Go to Dashboard</button>
          </div>
        )}
      </div>
    </div>
  );
}
