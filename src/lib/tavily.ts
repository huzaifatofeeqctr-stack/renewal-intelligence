export interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

export interface TavilySearch {
  answer: string;
  results: TavilyResult[];
}

export async function tavilySearch(query: string): Promise<TavilySearch> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY must be set');
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      search_depth: 'advanced',
      max_results: 5,
      include_answer: true,
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { answer?: string; results?: TavilyResult[] };
  return { answer: data.answer ?? '', results: data.results ?? [] };
}
