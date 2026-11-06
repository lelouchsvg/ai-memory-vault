'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ padding: 48, fontFamily: 'Arial,sans-serif' }}>
      <h1>We couldn’t load Control Tower.</h1>
      <p>
        Check that PostgreSQL is running and review the application log for the failed operation.
      </p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
