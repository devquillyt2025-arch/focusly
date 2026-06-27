import { motion } from 'framer-motion';

const GROUPS = [
  {
    title: 'Timer',
    items: [
      { key: 'Space', desc: 'Start / Pause' },
      { key: 'R',     desc: 'Reset timer' },
      { key: '1',     desc: 'Focus mode' },
      { key: '2',     desc: 'Short break' },
      { key: '3',     desc: 'Long break' },
      { key: '4',     desc: 'Custom timer' },
    ],
  },
  {
    title: 'App',
    items: [
      { key: 'N',     desc: 'New task' },
      { key: 'A',     desc: 'Analytics' },
      { key: 'S',     desc: 'Settings' },
      { key: '?',     desc: 'Shortcuts' },
      { key: 'D',     desc: 'Toggle theme' },
      { key: 'Esc',   desc: 'Close modal' },
    ],
  },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-hdr">
          <h3>⌨️ Keyboard Shortcuts</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-form shortcuts-grid">
          {GROUPS.map(g => (
            <div key={g.title} className="shortcut-group">
              <h4>{g.title}</h4>
              {g.items.map(it => (
                <div key={it.key} className="shortcut-row">
                  <kbd>{it.key}</kbd>
                  <span>{it.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
