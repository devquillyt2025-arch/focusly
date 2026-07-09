import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Minimal analytics sink. Right now it just logs — the value is the schema and
 * the beacon wiring on the client. Point this at PostHog / Plausible / a
 * warehouse when you want durable engagement data.
 */
export async function POST(req: Request) {
  try {
    const event = await req.json();
    // eslint-disable-next-line no-console
    console.log('[nook:engagement]', JSON.stringify(event));
  } catch {
    // ignore malformed beacons
  }
  // 204: beacons don't read the response body.
  return new NextResponse(null, { status: 204 });
}
