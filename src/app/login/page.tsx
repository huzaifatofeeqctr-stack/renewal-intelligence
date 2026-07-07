import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authn';
import AuthForm from './AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/');
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p className="subtitle">Sign in to Renewal Intelligence</p>
        <AuthForm mode="login" />
        <p className="auth-switch">
          No account yet? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </div>
  );
}
