'use client';

import { useEffect, useState } from 'react';

interface TitleInsight {
  title: string;
  not_helpful: number;
  inaccurate: number;
}

// Feedback → ICP tuning: shows which stakeholder titles keep collecting 👎 or
// "inaccurate" ratings, with one click to drop them from the ICP title list.
export default function IcpTuning({
  icpTitles,
  onRemoveTitle,
  busy,
}: {
  icpTitles: string;
  onRemoveTitle: (title: string) => void;
  busy: boolean;
}) {
  const [insights, setInsights] = useState<TitleInsight[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/feedback-insights')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: { titles: TitleInsight[] }) => setInsights(d.titles))
      .catch(() => setError('Could not load feedback insights'));
  }, []);

  const icpList = icpTitles.split(',').map((t) => t.trim()).filter(Boolean);
  const inIcp = (title: string) =>
    icpList.some((t) => t.toLowerCase() === title.toLowerCase());

  return (
    <div className="icp-block">
      <strong>Feedback → ICP tuning</strong>
      <small>
        Stakeholder titles your team rated 👎 or inaccurate. Removing a title stops discovery from surfacing it.
      </small>
      {error ? (
        <p className="template-hint">{error}</p>
      ) : insights === null ? (
        <p className="template-hint">Loading…</p>
      ) : insights.length === 0 ? (
        <p className="template-hint">No negative ratings yet — rate signals 👍/👎 in the feed to teach the system.</p>
      ) : (
        <div className="settings-rows">
          {insights.slice(0, 10).map((t) => (
            <div className="setting-row" key={t.title}>
              <span>
                <strong>{t.title}</strong>
                <small>
                  {t.not_helpful > 0 ? `${t.not_helpful} not helpful` : ''}
                  {t.not_helpful > 0 && t.inaccurate > 0 ? ' · ' : ''}
                  {t.inaccurate > 0 ? `${t.inaccurate} inaccurate` : ''}
                </small>
              </span>
              {inIcp(t.title) ? (
                <button className="btn-clear" disabled={busy} onClick={() => onRemoveTitle(t.title)}>
                  Remove from ICP titles
                </button>
              ) : (
                <span className="badge muted">not in ICP list</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
