import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authn';
import AuthForm from '../login/AuthForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (await getSessionUser()) redirect('/');
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="subtitle">The first account becomes the workspace admin.</p>
        <AuthForm mode="signup" />
        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
