import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertOrigin, currentActor, login, logout } from '@/lib/auth';
import { readBodyLimited } from '@/lib/http';
export const runtime = 'nodejs';
export async function GET() {
  const actor = await currentActor();
  return NextResponse.json(
    { actor, demoEnabled: process.env.DEMO_LOGIN_ENABLED === 'true' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const body = z
      .object({
        action: z.enum(['login', 'logout', 'demo']),
        email: z.string().email().optional(),
        password: z.string().max(256).optional(),
      })
      .parse(JSON.parse(new TextDecoder().decode(await readBodyLimited(request, 8192))));
    if (body.action === 'logout') {
      await logout();
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'demo') {
      if (
        process.env.DEMO_LOGIN_ENABLED !== 'true' ||
        !process.env.DEMO_EMAIL ||
        !process.env.DEMO_PASSWORD
      )
        return NextResponse.json({ error: 'Demo sign-in is disabled.' }, { status: 403 });
      return NextResponse.json(
        await login(process.env.DEMO_EMAIL, process.env.DEMO_PASSWORD, true),
      );
    }
    if (!body.email || !body.password)
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    return NextResponse.json(await login(body.email, body.password));
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? 'Invalid sign-in details.'
        : error instanceof Error
          ? error.message
          : 'Sign-in failed.';
    return NextResponse.json(
      { error: message },
      { status: message.includes('Too many') ? 429 : 400 },
    );
  }
}
