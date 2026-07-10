import Link from 'next/link';

export function SearchBar({
  basePath,
  q,
  placeholder,
  keep = {},
}: {
  basePath: string;
  q: string;
  placeholder: string;
  keep?: Record<string, string>; // extra params (sort/filters) to survive a new search
}) {
  const kept = Object.entries(keep).filter(([, v]) => v);
  const clearHref = kept.length
    ? `${basePath}?${kept.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`
    : basePath;
  return (
    <form className="toolbar" action={basePath} method="get">
      {kept.map(([k, v]) => (
        <input type="hidden" name={k} value={v} key={k} />
      ))}
      <input type="search" name="q" defaultValue={q} placeholder={placeholder} className="search-input" />
      <button type="submit" className="btn-secondary">Search</button>
      {q && (
        <Link href={clearHref} className="btn-clear">
          Clear
        </Link>
      )}
    </form>
  );
}

export function Pagination({
  basePath,
  q,
  page,
  totalPages,
  totalItems,
  keep = {},
}: {
  basePath: string;
  q: string;
  page: number;
  totalPages: number;
  totalItems: number;
  keep?: Record<string, string>; // extra params (sort/filters) to survive paging
}) {
  if (totalPages <= 1) return null;
  const kept = Object.entries(keep)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}&`)
    .join('');
  const href = (p: number) => `${basePath}?${q ? `q=${encodeURIComponent(q)}&` : ''}${kept}page=${p}`;

  const pages: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pages.push(p);

  return (
    <nav className="pagination">
      <span className="page-info">
        {totalItems.toLocaleString()} results · page {page} of {totalPages}
      </span>
      <span className="page-links">
        {page > 1 && <Link href={href(1)}>« First</Link>}
        {page > 1 && <Link href={href(page - 1)}>‹ Prev</Link>}
        {pages.map((p) =>
          p === page ? (
            <span key={p} className="page-current">{p}</span>
          ) : (
            <Link key={p} href={href(p)}>{p}</Link>
          )
        )}
        {page < totalPages && <Link href={href(page + 1)}>Next ›</Link>}
        {page < totalPages && <Link href={href(totalPages)}>Last »</Link>}
      </span>
    </nav>
  );
}

export function parsePage(sp: { [key: string]: string | string[] | undefined }): { q: string; page: number } {
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const rawPage = typeof sp.page === 'string' ? parseInt(sp.page, 10) : 1;
  return { q, page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1 };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
