import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Control Tower · Wholesale OS',
  description: 'Your acquisitions company, in one operating system.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
