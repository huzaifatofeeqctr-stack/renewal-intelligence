import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import { cookies } from 'next/headers';
import { coll } from './db';

const SESSION_COOKIE = 'ri_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface UserDoc {
  email: string;
  name: string;
  password_hash: string; // salt:hash (scrypt)
  role: 'admin' | 'member';
  settings: {
    email_alerts: boolean;
    weekly_digest: boolean;
    default_view: 'accounts' | 'signals' | 'contacts';
  };
  created_at: string;
  updated_at: string;
}

export interface SessionDoc {
  token_hash: string;
  user_email: string;
  created_at: string;
  expires_at: string;
  expireAt?: Date; // Date-typed copy of expires_at for the Mongo TTL index
}

export type SafeUser = Omit<UserDoc, 'password_hash'>;

export const DEFAULT_SETTINGS: UserDoc['settings'] = {
  email_alerts: true,
  weekly_digest: false,
  default_view: 'accounts',
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function usersColl() {
  const c = await coll<UserDoc>('users');
  await c.createIndex({ email: 1 }, { unique: true }).catch(() => {});
  return c;
}

async function sessionsColl() {
  const c = await coll<SessionDoc>('sessions');
  await c.createIndex({ token_hash: 1 }, { unique: true }).catch(() => {});
  return c;
}

export async function createUser(email: string, name: string, password: string): Promise<SafeUser> {
  const users = await usersColl();
  const count = await users.countDocuments();
  const now = new Date().toISOString();
  const doc: UserDoc = {
    email: email.toLowerCase().trim(),
    name: name.trim(),
    password_hash: hashPassword(password),
    role: count === 0 ? 'admin' : 'member', // first user becomes admin
    settings: DEFAULT_SETTINGS,
    created_at: now,
    updated_at: now,
  };
  await users.insertOne(doc);
  const { password_hash: _ph, ...safe } = doc;
  return safe;
}

// Hardcoded test login (works even on a fresh, empty database).
const TEST_EMAIL = 'test@gmail.com';
const TEST_PASSWORD = 'test@123';

export async function authenticate(email: string, password: string): Promise<SafeUser | null> {
  const users = await usersColl();

  if (email.toLowerCase().trim() === TEST_EMAIL && password === TEST_PASSWORD) {
    const now = new Date().toISOString();
    await users.updateOne(
      { email: TEST_EMAIL },
      {
        $set: { updated_at: now },
        $setOnInsert: {
          email: TEST_EMAIL,
          name: 'Test User',
          password_hash: hashPassword(TEST_PASSWORD),
          role: 'admin' as const,
          settings: DEFAULT_SETTINGS,
          created_at: now,
        },
      },
      { upsert: true }
    );
    const testUser = await users.findOne({ email: TEST_EMAIL });
    if (testUser) {
      const { password_hash: _ph, ...safe } = testUser;
      return safe;
    }
  }

  const user = await users.findOne({ email: email.toLowerCase().trim() });
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  const { password_hash: _ph, ...safe } = user;
  return safe;
}

export async function createSession(email: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const sessions = await sessionsColl();
  await sessions.insertOne({
    token_hash: hashToken(token),
    user_email: email.toLowerCase(),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    expireAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function getSessionUser(): Promise<SafeUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sessions = await sessionsColl();
  const session = await sessions.findOne({ token_hash: hashToken(token) });
  if (!session || session.expires_at < new Date().toISOString()) return null;
  const users = await usersColl();
  const user = await users.findOne({ email: session.user_email });
  if (!user) return null;
  const { password_hash: _ph, ...safe } = user;
  return { ...safe, settings: { ...DEFAULT_SETTINGS, ...safe.settings } };
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const sessions = await sessionsColl();
    await sessions.deleteOne({ token_hash: hashToken(token) });
  }
  cookies().delete(SESSION_COOKIE);
}
