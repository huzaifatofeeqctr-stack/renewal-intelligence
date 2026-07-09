'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Inbox workflow: new → acknowledged → actioned; dismiss is "not relevant".
export default function SignalActions({
  id,
  status,
  relevance,
}: {
  id: string;
  status: string;
  relevance: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/signals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="actions">
      <button
        disabled={busy}
        className={relevance === 'helpful' ? 'active' : ''}
        onClick={() => patch({ relevance: 'helpful' })}
        title="Mark as helpful (feedback loop)"
      >
        👍
      </button>
      <button
        disabled={busy}
        className={relevance === 'not_helpful' ? 'active' : ''}
        onClick={() => patch({ relevance: 'not_helpful' })}
        title="Mark as not helpful — repeated 👎 tune the ICP list"
      >
        👎
      </button>
      {status === 'new' && (
        <button disabled={busy} onClick={() => patch({ status: 'acknowledged' })} title="I've seen this">
          Ack
        </button>
      )}
      {(status === 'new' || status === 'acknowledged') && (
        <button disabled={busy} onClick={() => patch({ status: 'actioned' })} title="I acted on this">
          Actioned
        </button>
      )}
      {status === 'dismissed' ? (
        <button disabled={busy} onClick={() => patch({ status: 'new' })}>
          Restore
        </button>
      ) : (
        <button disabled={busy} onClick={() => patch({ status: 'dismissed' })} title="Not relevant — hide it">
          Dismiss
        </button>
      )}
    </div>
  );
}
