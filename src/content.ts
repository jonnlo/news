export const categories = [
  'Technology',
  'Design',
  'Hong Kong',
  'Philosophy',
  'Literature',
] as const;

export type Category = (typeof categories)[number];

export interface Story {
  title: string;
  url: string;
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
