import newsSettings from './data/news-settings.json';

export const categories = newsSettings.categories
  .filter((category) => category.enabled)
  .map((category) => category.name);

export type Category = string;

export interface Story {
  title: string;
  url: string;
  discussionUrl?: string;
  sourceUrl?: string;
  relatedSources?: { source: string; url: string; title: string }[];
  source: string;
  sourceRole?: 'curator' | 'community' | 'publisher';
  category: Category;
  publishedAt: string | null;
  excerpt: string;
  image?: string;
  score?: number;
}

export interface Edition {
  date: string;
  generatedAt: string;
  timezone: 'Asia/Hong_Kong';
  collectionMode?: 'source-led';
  stories: Story[];
  sourcesChecked: number;
  sourceErrors: (string | { source: string; error: string })[];
  sources?: SourceCollection[];
}

export interface SourceCollection {
  name: string;
  category: Category;
  kind?: string;
  count?: number;
  stories: Story[];
}

export function formatDate(value: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return 'Date not listed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not listed';
  return new Intl.DateTimeFormat('en-HK', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Hong_Kong', ...options,
  }).format(date);
}

export function formatRelativeAge(value: string | null, now = Date.now()) {
  if (!value) return '—';
  const publishedAt = Date.parse(value);
  if (Number.isNaN(publishedAt)) return '—';

  const age = Math.max(0, now - publishedAt);
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(age / 3_600_000);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(age / 86_400_000);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function formatHongKongTime(value: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-HK', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong', ...options,
  }).format(date);
}

export function formatPublicationTimestamp(value: string | null, referenceDate?: string) {
  if (!value) return 'Time unavailable';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Time unavailable';
  if (!referenceDate) return formatDate(value, { day: 'numeric', month: 'short' }) + ` · ${formatHongKongTime(value)} HKT`;

  const dateKey = (date: Date) => new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Hong_Kong',
  }).format(date);
  const reference = new Date(`${referenceDate}T00:00:00+08:00`);
  const date = dateKey(timestamp) === dateKey(reference)
    ? ''
    : `${formatDate(value, { day: 'numeric', month: 'short' })} · `;
  return `${date}${formatHongKongTime(value)} HKT`;
}
