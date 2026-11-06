import Link from 'next/link';
export default function NotFound() {
  return (
    <main style={{ padding: 48 }}>
      <h1>Page not found</h1>
      <Link href="/">Return to Control Tower</Link>
    </main>
  );
}
