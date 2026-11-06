import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/auth';
import { pool } from '@/lib/db';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return NextResponse.json({ error: 'Invalid document ID.' }, { status: 400 });
  const result = await pool.query(
    'SELECT d.mode,d.data,f.bytes,f.filename,f.mime_type FROM documents d LEFT JOIN document_files f ON f.document_id=d.id WHERE d.id=$1',
    [id],
  );
  const doc = result.rows[0];
  if (!doc || (actor.demoOnly && doc.mode !== 'DEMO'))
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  if (!doc.bytes && !doc.data.content)
    return NextResponse.json(
      { error: 'No file is stored for this document. Review its source metadata.' },
      { status: 404 },
    );
  const filename = String(doc.filename || doc.data.name || 'document.txt').replace(
    /[^a-zA-Z0-9._ -]/g,
    '_',
  );
  return new Response(doc.bytes || doc.data.content, {
    headers: {
      'Content-Type': doc.mime_type || 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    },
  });
}
