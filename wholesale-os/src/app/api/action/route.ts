import { NextResponse } from 'next/server';
import { assertOrigin, currentActor } from '@/lib/auth';
import { executeAction } from '@/lib/service';
import { pool } from '@/lib/db';
import { readBodyLimited } from '@/lib/http';
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  let operation: Record<string, unknown> = {};
  try {
    assertOrigin(request);
    if (Number(request.headers.get('content-length') ?? 0) > 1_000_000)
      return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
    const text = new TextDecoder().decode(await readBodyLimited(request, 1_000_000));
    if (text.length > 1_000_000)
      return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
    const input = JSON.parse(text);
    operation = input;
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.action !== 'string' ||
      !['DEMO', 'LIVE'].includes(input.mode)
    )
      return NextResponse.json({ error: 'Action and mode are required.' }, { status: 400 });
    if (input.action === 'uploadFile')
      return NextResponse.json(
        { error: 'Use the authenticated document upload endpoint.' },
        { status: 400 },
      );
    if (actor.demoOnly && input.mode !== 'DEMO')
      return NextResponse.json(
        { error: 'Demo accounts cannot modify LIVE records.' },
        { status: 403 },
      );
    if (actor.role === 'VIEWER')
      return NextResponse.json({ error: 'Read-only account.' }, { status: 403 });
    const data = await executeAction(actor, input);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Action failed.';
    const code = typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : '';
    if (
      ['DEMO', 'LIVE'].includes(String(operation?.mode)) &&
      !(actor.demoOnly && operation.mode === 'LIVE')
    ) {
      try {
        await pool.query(
          'INSERT INTO operation_errors(mode,actor,action,entity_id,error) VALUES($1,$2,$3,$4,$5)',
          [
            operation.mode,
            actor.email,
            String(operation.action || 'UNKNOWN').slice(0, 100),
            typeof operation.propertyId === 'string' ? operation.propertyId : null,
            JSON.stringify({
              message: error.slice(0, 1000),
              code: code || 'ACTION_REJECTED',
              at: new Date().toISOString(),
            }),
          ],
        );
      } catch {
        console.error('operation_error_record_failed');
      }
    }
    if (['23505', '23503', '22P02', '23514'].includes(code))
      return NextResponse.json(
        { error: 'Invalid or duplicate record. Check entity links and required fields.' },
        { status: 400 },
      );
    if (code && /^\d/.test(code)) {
      console.error('action_database_failed', code);
      return NextResponse.json({ error: 'Database operation failed.' }, { status: 500 });
    }
    const status =
      typeof e === 'object' &&
      e !== null &&
      'status' in e &&
      typeof e.status === 'number' &&
      [400, 401, 403, 404, 409, 422, 429, 503].includes(e.status)
        ? e.status
        : 400;
    return NextResponse.json({ error }, { status });
  }
}
