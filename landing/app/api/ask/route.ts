import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

// Runs on the Node runtime (the Anthropic SDK needs Node APIs, not Edge).
export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are the brain behind "nook", a holographic, dark-first personal productivity app.
Nook is organized into modules: habits, goals, journal, tasks, calendar, finance, activity log, and reports.

A visitor will hand you a raw task, goal, or thought. Respond as nook would when it decides how to structure that input across its modules.

Rules:
- Be concise and concrete. 2–4 short lines, no preamble, no sign-off.
- Route the input to the right module(s) and say what nook would create there
  (e.g. "→ tasks: draft outline (due Fri)", "→ habits: 20-min daily writing streak").
- Use lowercase, calm, confident phrasing that matches a minimalist app's voice.
- Prefer arrows and terse fragments over full sentences. No emoji.
- If the input is vague, make one reasonable assumption and proceed — do not ask a question.`;

export async function POST(req: Request) {
  let task = '';
  try {
    const body = (await req.json()) as { task?: unknown };
    task = typeof body.task === 'string' ? body.task.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!task) {
    return NextResponse.json({ error: 'Say what you want to do.' }, { status: 400 });
  }
  if (task.length > 600) {
    task = task.slice(0, 600);
  }

  // Graceful degradation: without a key the page still works — the widget just
  // returns a canned, on-brand demo answer instead of erroring out.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      answer:
        '→ tasks: capture "' +
        task.slice(0, 48) +
        '"\n→ goals: link to a weekly outcome\n→ reports: surface it in friday review\n\n(demo mode — set ANTHROPIC_API_KEY for live answers)',
      demo: true,
    });
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 400,
      // Snappy widget: we omit `thinking` on purpose — on Opus 4.8 that runs
      // without extended thinking, keeping the round-trip interactive.
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: task }],
    });

    const answer = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return NextResponse.json({ answer });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'nook is thinking too hard right now. try again in a moment.' },
        { status: 429 }
      );
    }
    // eslint-disable-next-line no-console
    console.error('[ask-nook] error', err);
    return NextResponse.json(
      { error: 'nook could not respond. try again.' },
      { status: 502 }
    );
  }
}
