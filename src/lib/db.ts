import { MongoClient, Db, Collection, Document } from 'mongodb';

// Cached across hot reloads / route invocations within one server process.
let clientPromise: Promise<MongoClient> | null = null;
let indexesEnsured = false;

async function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI must be set');
    clientPromise = new MongoClient(uri, { maxPoolSize: 10 }).connect();
  }
  return clientPromise;
}

export async function db(): Promise<Db> {
  const client = await getClient();
  const database = client.db(process.env.MONGODB_DB || 'renewal_intelligence');
  if (!indexesEnsured) {
    indexesEnsured = true;
    await ensureIndexes(database).catch((e) => {
      indexesEnsured = false;
      console.error('index creation failed:', e);
    });
  }
  return database;
}

async function ensureIndexes(database: Db): Promise<void> {
  await Promise.all([
    database.collection('accounts').createIndex({ sfdc_id: 1 }, { unique: true }),
    database.collection('contacts').createIndex({ sfdc_id: 1 }, { unique: true }),
    database.collection('contacts').createIndex({ account_sfdc_id: 1 }),
    database.collection('contacts').createIndex({ is_junk: 1 }),
    // signal_key uniqueness is the dedup mechanism for the whole signal path
    database.collection('signals').createIndex({ signal_key: 1 }, { unique: true }),
    database.collection('signals').createIndex({ detected_at: -1 }),
    database.collection('signals').createIndex({ account_sfdc_id: 1, dismissed: 1 }),
    database.collection('industry_intel').createIndex({ industry: 1 }, { unique: true }),
    database.collection('notification_log').createIndex({ signal_key: 1 }, { unique: true }),
    database.collection('enrichment_run_log').createIndex({ workflow_name: 1, run_at: -1 }),
  ]);
}

export async function coll<T extends Document = Document>(name: string): Promise<Collection<T>> {
  return (await db()).collection<T>(name);
}

export function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
}
