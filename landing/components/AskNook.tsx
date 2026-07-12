'use client';

import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { track } from '@/lib/analytics';

/**
 * "ask nook" — a one-input live demo of the product's brain. You type a task or
 * goal; it hits Claude server-side and answers how nook would route it across
 * its modules. No login, no signup — just a taste of what nook does.
 */
export default function AskNook() {
  const [task, setTask] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = task.trim();
    if (!value || loading) return;

    setLoading(true);
    setError('');
    setAnswer('');
    track('ask_nook');

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'something went wrong.');
      } else {
        setAnswer(data.answer ?? '');
      }
    } catch {
      setError('nook is offline. try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass glass-sheen mx-auto w-full max-w-xl rounded-3xl p-6 sm:p-8">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2 w-2 animate-glow-pulse rounded-full bg-holo-magenta" />
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-holo-ice/50">
          ask nook
        </span>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="ship the portfolio by friday…"
          maxLength={600}
          className="w-full flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-holo-ice placeholder:text-holo-ice/30 outline-none transition focus:border-holo-magenta/50 focus:ring-1 focus:ring-holo-magenta/30"
        />
        <button
          type="submit"
          disabled={loading || !task.trim()}
          className="rounded-xl bg-holo-ice/95 px-5 py-3 text-sm font-medium text-void transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'thinking…' : 'ask'}
        </button>
      </form>

      <AnimatePresence mode="wait">
        {(answer || error) && (
          <motion.div
            key={error || answer}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mt-5 whitespace-pre-wrap rounded-xl border border-white/5 bg-black/20 p-4 font-mono text-sm leading-relaxed text-holo-ice/85"
          >
            {error ? (
              <span className="text-holo-pink/80">{error}</span>
            ) : (
              answer
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
