'use client';

import { useState } from 'react';

export interface Briefing {
  industry: string;
  summary: string;
  generated_at: string | null;
  sources: { title: string; url: string }[];
}

// Briefings arrive as light markdown (# headings, **bold**). Render it safely:
// escape first, then apply formatting.
function briefingHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks = escaped.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      const heading = b.match(/^#{1,6}\s+(.*)$/);
      if (heading) return `<h4>${inline(heading[1])}</h4>`;
      if (/^[-*]\s/.test(b)) {
        const items = b.split('\n').map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`);
        return `<ul>${items.join('')}</ul>`;
      }
      return `<p>${inline(b).replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

// Strip markdown for the card preview.
function plainPreview(text: string): string {
  return text
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function IndustryGrid({ briefings }: { briefings: Briefing[] }) {
  const [open, setOpen] = useState<Briefing | null>(null);

  return (
    <>
      <div className="intel-grid">
        {briefings.map((b) => (
          <div
            className="intel-card"
            key={b.industry}
            role="button"
            tabIndex={0}
            onClick={() => setOpen(b)}
            onKeyDown={(e) => e.key === 'Enter' && setOpen(b)}
          >
            <div className="intel-card-head">
              <strong>{b.industry}</strong>
              {b.generated_at && (
                <span className="badge muted">refreshed {new Date(b.generated_at).toLocaleDateString()}</span>
              )}
            </div>
            <p className="intel-preview">{plainPreview(b.summary)}</p>
            <div className="intel-card-foot">
              <span>{b.sources.length} source{b.sources.length === 1 ? '' : 's'}</span>
              <span className="intel-more">Read briefing →</span>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal intel-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{open.industry}</h2>
                <div className="meta">
                  {open.generated_at
                    ? `Refreshed ${new Date(open.generated_at).toLocaleDateString()} — Tavily + Anthropic`
                    : 'Tavily + Anthropic'}
                </div>
              </div>
              <div className="modal-head-actions">
                <button className="modal-close" onClick={() => setOpen(null)} aria-label="Close">✕</button>
              </div>
            </div>
            <div className="modal-body">
              <div className="intel-briefing" dangerouslySetInnerHTML={{ __html: briefingHtml(open.summary) }} />
              {open.sources.length > 0 && (
                <div className="intel-sources">
                  <h4>Sources</h4>
                  <ol>
                    {open.sources.map((s, i) => (
                      <li key={i}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title || s.url}
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
