import { requireUser } from '@/lib/require-user';
import ProfileForm from './ProfileForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <main>
      <h1>Profile</h1>
      <p className="subtitle">
        {user.email} · {user.role} · joined {new Date(user.created_at).toLocaleDateString()}
      </p>
      <ProfileForm initialName={user.name} />
    </main>
  );
}
