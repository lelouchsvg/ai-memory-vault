import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/auth';
import { getState } from '@/lib/service';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const mode = new URL(request.url).searchParams.get('mode') ?? 'DEMO';
  if (mode !== 'DEMO' && mode !== 'LIVE')
    return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 });
  if (mode === 'LIVE' && actor.demoOnly)
    return NextResponse.json(
      {
        error:
          'Demo accounts cannot access LIVE records. Create an owner account to use LIVE mode.',
      },
      { status: 403 },
    );
  try {
    return NextResponse.json(
      { ...(await getState(mode)), actor },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('state_read_failed', e instanceof Error ? e.name : 'unknown');
    return NextResponse.json(
      { error: 'Database unavailable. Check the server log and database setup.' },
      { status: 503 },
    );
  }
}
