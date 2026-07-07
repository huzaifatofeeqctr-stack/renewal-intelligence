import { redirect } from 'next/navigation';
import { getSessionUser, SafeUser } from './authn';

// Server-component guard: redirects to /login when there is no valid session.
export async function requireUser(): Promise<SafeUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}
