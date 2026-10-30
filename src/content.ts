export const categories = [
  'Technology',
  'Design',
  'Hong Kong',
  'Society',
  'Philosophy',
  'Literature',
  'Arts',
  'Discover',
] as const;

export type Category = (typeof categories)[number];

export interface Story {
  title: string;
  url: string;
  discussionUrl?: string;
  relatedSources?: { source: string; url: string; title: string }[];
  source: string;
  category: Category;
  publishedAt: string | null;
  excerpt: string;
  image?: string;
  score: number;
}

export interface Edition {
  date: string;
  generatedAt: string;
  timezone: 'Asia/Hong_Kong';
  stories: Story[];
  sourcesChecked: number;
  sourceErrors: string[];
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
  if (minutes < 60) return `${minutes}min`;

  const hours = Math.floor(age / 3_600_000);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(age / 86_400_000);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}m`;
  return `${Math.floor(days / 365)}y`;
}
