import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { getSessionUser } from '@/lib/authn';
import './globals.css';

export const metadata: Metadata = {
  title: 'Renewal Intelligence',
  description: 'CRM enrichment & account intelligence for renewal teams',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body>
        {user ? (
          <div className="app">
            <aside className="sidebar">
              <Link href="/" className="brand">
                Renewal<br />Intelligence
              </Link>
              <nav className="side-nav">
                <Link href="/">Accounts</Link>
                <Link href="/signals">Signals</Link>
                <Link href="/contacts">Contacts</Link>
                <Link href="/industry">Industry Intel</Link>
                <Link href="/import">Import</Link>
              </nav>
              <div className="side-user">
                <Link href="/settings" className="side-user-main" title="Settings">
                  <span className="avatar">
                    {user.name
                      .split(/\s+/)
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="side-user-name">
                    <strong>{user.name}</strong>
                    <small>Settings</small>
                  </span>
                </Link>
                <div className="side-user-links">
                  <Link href="/profile">Profile</Link>
                  <form action="/api/auth/logout" method="post">
                    <button type="submit">Sign out</button>
                  </form>
                </div>
              </div>
            </aside>
            <div className="content">{children}</div>
          </div>
        ) : (
          <div className="shell">{children}</div>
        )}
      </body>
    </html>
  );
}
