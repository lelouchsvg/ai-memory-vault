import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { currentActor } from '@/lib/auth';
import { executeAction } from '@/lib/service';
import { readBodyLimited } from '@/lib/http';
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (actor.role !== 'OWNER')
    return NextResponse.json({ error: 'Owner permission required.' }, { status: 403 });
  const allowed = new Set([
    process.env.APP_ORIGIN || 'http://localhost:3000',
    new URL(request.url).origin,
  ]);
  if (!allowed.has(request.headers.get('origin') || ''))
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 11 * 1024 * 1024)
    return NextResponse.json({ error: 'Upload exceeds 10 MB.' }, { status: 413 });
  try {
    const bytesBody = await readBodyLimited(request, 11 * 1024 * 1024);
    const form = await new Response(bytesBody, {
      headers: { 'Content-Type': request.headers.get('content-type') || '' },
    }).formData();
    const mode = String(form.get('mode'));
    const file = form.get('file');
    if (!['DEMO', 'LIVE'].includes(mode) || (actor.demoOnly && mode !== 'DEMO'))
      throw new Error('Invalid record mode.');
    if (!(file instanceof File) || file.size < 1 || file.size > 10 * 1024 * 1024)
      throw new Error('Choose a file up to 10 MB.');
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type;
    const pdf = mime === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-';
    const png =
      mime === 'image/png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const text = mime === 'text/plain' && !bytes.includes(0);
    if (!pdf && !png && !jpg && !text)
      throw new Error('Only verified PDF, PNG, JPEG, or plain text files are supported.');
    const filename = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 160) || 'document';
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const document = (await executeAction(actor, {
      action: 'uploadFile',
      mode,
      record: {
        propertyId: form.get('propertyId'),
        name: filename,
        type: String(form.get('type') || 'Other'),
        status: 'UPLOADED',
        source: 'Owner file upload',
        mimeType: mime,
        size: bytes.length,
        sha256,
      },
      file: { filename, mimeType: mime, bytesBase64: bytes.toString('base64'), sha256 },
    })) as { id: string };
    return NextResponse.json({ ok: true, document });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed.' },
      { status: 400 },
    );
  }
}
