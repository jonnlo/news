// Read story IDs from HN's actual best page: the API's beststories endpoint
// does not document an equivalent hour filter or the same ranking as this page.
export function parseBestPage(html, pageUrl) {
  const ids = [];
  for (const match of html.matchAll(/<tr\b[^>]*>/gi)) {
    const tag = match[0];
    const classes = tag.match(/\bclass\s*=\s*["']([^"']+)["']/i)?.[1]?.split(/\s+/) ?? [];
    const id = tag.match(/\bid\s*=\s*["'](\d+)["']/i)?.[1];
    if (classes.includes('athing') && id) ids.push(Number(id));
  }
  const moreTag = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => m[0]).find((tag) =>
    /\bclass\s*=\s*["'][^"']*\bmorelink\b[^"']*["']/i.test(tag));
  const href = moreTag?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&');
  let next = null;
  if (href) {
    const current = new URL(pageUrl);
    const target = new URL(href, current);
    if (target.origin === 'https://news.ycombinator.com' && target.pathname === '/best'
        && target.searchParams.get('h') === current.searchParams.get('h')) next = target.toString();
  }
  if (!ids.length) throw new Error('Hacker News best page contained no recognizable story IDs');
  return { ids, next };
}

export async function fetchBestIds(url, fetchPage, limit = 35) {
  const start = new URL(url);
  if (start.origin !== 'https://news.ycombinator.com' || start.pathname !== '/best') {
    throw new Error('Hacker News source URL must be an HTTPS news.ycombinator.com/best page');
  }
  const all = [];
  const seen = new Set();
  let next = start.toString();
  // The first two pages suffice for the 35-candidate limit. Follow only HN's
  // own next-page link with the same hour filter; never guess pagination.
  for (let page = 0; next && page < 2 && all.length < limit; page++) {
    const result = parseBestPage(await fetchPage(next), next);
    for (const id of result.ids) if (!seen.has(id)) { seen.add(id); all.push(id); }
    next = result.next;
  }
  return all.slice(0, limit);
}
