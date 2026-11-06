import { NextResponse } from 'next/server';
import { assertOrigin, currentActor } from '@/lib/auth';
import { readBodyLimited } from '@/lib/http';
import { executeOsAction, getOsState } from '@/lib/os-service';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const mode = new URL(request.url).searchParams.get('mode') ?? 'DEMO';
  if (mode !== 'DEMO' && mode !== 'LIVE')
    return NextResponse.json({ error: 'Invalid workspace mode.' }, { status: 400 });
  if (actor.demoOnly && mode !== 'DEMO')
    return NextResponse.json(
      { error: 'Demo accounts cannot access LIVE records.' },
      { status: 403 },
    );
  try {
    return NextResponse.json(
      { ...(await getOsState(actor, mode)), actor },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'Agentic workspace unavailable. Check migrations and the worker log.' },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  let input: Record<string, unknown> = {};
  try {
    assertOrigin(request);
    const body = JSON.parse(new TextDecoder().decode(await readBodyLimited(request, 65536)));
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return NextResponse.json({ error: 'An action object is required.' }, { status: 400 });
    input = body;
    if (!['DEMO', 'LIVE'].includes(String(input.mode)))
      return NextResponse.json({ error: 'Workspace mode is required.' }, { status: 400 });
    if (actor.demoOnly && input.mode !== 'DEMO')
      return NextResponse.json(
        { error: 'Demo accounts cannot modify LIVE records.' },
        { status: 403 },
      );
    if (actor.role === 'VIEWER')
      return NextResponse.json({ error: 'Read-only account.' }, { status: 403 });
    return NextResponse.json({ ok: true, data: await executeOsAction(actor, input) });
  } catch (error) {
    const declared =
      error && typeof error === 'object' && 'status' in error ? Number(error.status) : 400;
    const status = [400, 401, 403, 404, 409, 422, 429, 503].includes(declared) ? declared : 400;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const message = error instanceof Error ? error.message : 'Command failed.';
    if (
      ['DEMO', 'LIVE'].includes(String(input.mode)) &&
      !(actor.demoOnly && input.mode === 'LIVE')
    ) {
      try {
        await pool.query(
          'INSERT INTO operation_errors(mode,actor,action,error) VALUES($1,$2,$3,$4)',
          [
            input.mode,
            actor.email,
            `OS:${String(input.action || 'UNKNOWN').slice(0, 80)}`,
            JSON.stringify({
              message: code ? 'Invalid command or record reference.' : message.slice(0, 1000),
              code: code || 'OS_ACTION_REJECTED',
              at: new Date().toISOString(),
            }),
          ],
        );
      } catch {
        console.error('os_error_record_failed');
      }
    }
    return NextResponse.json(
      { error: code ? 'Invalid command or record reference.' : message },
      { status },
    );
  }
}
