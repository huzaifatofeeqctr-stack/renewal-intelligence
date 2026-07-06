import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Renewal Intelligence',
  description: 'CRM enrichment & account intelligence for renewal teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <span className="brand">Renewal Intelligence</span>
            <Link href="/">Accounts</Link>
            <Link href="/signals">Signals</Link>
            <Link href="/contacts">Contacts</Link>
            <Link href="/industry">Industry Intel</Link>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
