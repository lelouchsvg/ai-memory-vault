'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { ArrowUpRight, ShieldCheck, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => {
        if (d.actor) router.replace('/');
        setDemo(d.demoEnabled);
      })
      .catch(() => setError('Could not connect to the server.'));
  }, [router]);
  async function submit(action: string, form?: HTMLFormElement) {
    setError('');
    setBusy(true);
    const fields = form ? Object.fromEntries(new FormData(form)) : {};
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...fields }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      router.replace('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setBusy(false);
    }
  }
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f4f5f1',
        padding: 24,
        color: '#172b32',
        fontFamily: 'Arial,sans-serif',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'white',
          padding: 40,
          border: '1px solid #dfe4df',
          borderRadius: 16,
          boxShadow: '0 20px 70px #122c3210',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
          <Building2 size={32} color="#177963" />
          <strong style={{ fontSize: 22, letterSpacing: -1 }}>
            CONTROL TOWER
            <span
              style={{
                display: 'block',
                fontSize: 10,
                letterSpacing: 3,
                color: '#73817d',
                marginTop: 5,
              }}
            >
              WHOLESALE OPERATING SYSTEM
            </span>
          </strong>
        </div>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Your next move, clearly.</h1>
        <p style={{ color: '#6a7976', lineHeight: 1.6, marginBottom: 26 }}>
          Sign in to your acquisitions command center.
        </p>
        <form
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            void submit('login', e.currentTarget);
          }}
        >
          <label style={{ display: 'block', fontSize: 13, marginBottom: 7 }}>
            Email address
            <input name="email" type="email" required autoComplete="username" style={inputStyle} />
          </label>
          <label style={{ display: 'block', fontSize: 13, margin: '18px 0' }}>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              style={inputStyle}
            />
          </label>
          {error && (
            <p role="alert" style={{ color: '#aa3434', fontSize: 13 }}>
              {error}
            </p>
          )}
          <button disabled={busy} style={buttonStyle}>
            Sign in <ArrowUpRight size={16} />
          </button>
        </form>
        {demo && (
          <>
            <div style={{ borderTop: '1px solid #eee', margin: '24px 0' }} />
            <button
              type="button"
              disabled={busy}
              onClick={() => submit('demo')}
              style={{ ...buttonStyle, background: '#eef4f0', color: '#176c57' }}
            >
              Explore the demo <ArrowUpRight size={16} />
            </button>
            <p style={{ fontSize: 12, color: '#7b8881', lineHeight: 1.6 }}>
              Fictional records. Fully interactive. Demo accounts cannot access live business data.
            </p>
          </>
        )}
        <p
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            fontSize: 11,
            color: '#87908b',
            marginTop: 28,
          }}
        >
          <ShieldCheck size={15} /> Secure session · Owner-controlled approvals
        </p>
      </section>
    </main>
  );
}
const inputStyle = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '12px 14px',
  border: '1px solid #d4ddd7',
  borderRadius: 7,
  fontSize: 15,
  marginTop: 8,
  background: '#fafbf9',
  color: '#172b32',
};
const buttonStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: 13,
  border: 0,
  borderRadius: 7,
  background: '#17745e',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};
