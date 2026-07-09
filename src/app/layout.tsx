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
                <div className="side-user-pop">
                  <Link href="/settings">⚙️ Settings</Link>
                  <Link href="/profile">👤 Profile management</Link>
                </div>
                <div className="side-user-row">
                  <Link href="/settings" className="side-user-main" title={user.email}>
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
                      <small>{user.role}</small>
                    </span>
                  </Link>
                  <form action="/api/auth/logout" method="post">
                    <button type="submit" className="logout-icon" title="Sign out" aria-label="Sign out">
                      ⏻
                    </button>
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
