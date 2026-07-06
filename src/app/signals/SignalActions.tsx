'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignalActions({
  id,
  dismissed,
  relevance,
}: {
  id: string;
  dismissed: boolean;
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
        title="Mark as not helpful"
      >
        👎
      </button>
      <button disabled={busy} onClick={() => patch({ dismissed: !dismissed })}>
        {dismissed ? 'Restore' : 'Dismiss'}
      </button>
    </div>
  );
}
