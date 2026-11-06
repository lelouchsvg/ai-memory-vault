import { describe, it, expect } from 'vitest';
import { readBodyLimited } from './http';
describe('bounded request bodies', () => {
  it('reads a normal body without changing bytes', async () => {
    const request = new Request('https://example.test', { method: 'POST', body: 'a✓b' });
    expect(new TextDecoder().decode(await readBodyLimited(request, 10))).toBe('a✓b');
  });
  it('stops a chunked body as soon as it exceeds the limit', async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('https://example.test', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readBodyLimited(request, 10)).rejects.toThrow('too large');
    expect(cancelled).toBe(true);
  });
});
