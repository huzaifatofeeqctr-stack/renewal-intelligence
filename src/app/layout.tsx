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
        <div className="shell">
          {user ? (
            <nav className="nav">
              <span className="brand">Renewal Intelligence</span>
              <Link href="/">Accounts</Link>
              <Link href="/signals">Signals</Link>
              <Link href="/contacts">Contacts</Link>
              <Link href="/industry">Industry Intel</Link>
              <Link href="/import">Import</Link>
              <div className="nav-user">
                <span className="avatar" title={user.email}>
                  {user.name
                    .split(/\s+/)
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div className="user-menu">
                  <div className="user-menu-header">
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </div>
                  <Link href="/profile">Profile</Link>
                  <Link href="/settings">Settings</Link>
                  <form action="/api/auth/logout" method="post">
                    <button type="submit">Sign out</button>
                  </form>
                </div>
              </div>
            </nav>
          ) : null}
          {children}
        </div>
      </body>
    </html>
  );
}
