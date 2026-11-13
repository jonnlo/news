import type { Edition, SourceCollection } from './content';

const savedEditions = Object.values(
  import.meta.glob('./data/editions/*.json', { eager: true, import: 'default' }),
) as Edition[];
const localEditions = import.meta.env.DEV ? Object.values(
  import.meta.glob('./data/local-editions/*.json', { eager: true, import: 'default' }),
) as Edition[] : [];

// The stable sort keeps the local snapshot first when both have the same date.
export const latestEdition: Edition | undefined = [...localEditions, ...savedEditions]
  .sort((a, b) => b.date.localeCompare(a.date))[0];

export function getEditionSourceGroups(edition: Edition | undefined): SourceCollection[] {
  if (edition?.sources?.length) return edition.sources.map((group) => ({ ...group, stories: [...group.stories] }));

  const stories = edition?.stories ?? [];
  return [...new Set(stories.map((story) => `${story.source}\u0000${story.category}`))].map((key) => {
    const [source, category] = key.split('\u0000');
    const sourceStories = stories.filter((story) => story.source === source && story.category === category);
    return { name: source, category: category ?? 'Discover', stories: sourceStories };
  });
}

export function sortSourceStories(group: SourceCollection) {
  if (group.kind === 'hackernews' || group.name === 'Hacker News') return;
  group.stories.sort((a, b) => {
    const timeA = a.publishedAt ? Date.parse(a.publishedAt) : Number.NEGATIVE_INFINITY;
    const timeB = b.publishedAt ? Date.parse(b.publishedAt) : Number.NEGATIVE_INFINITY;
    return (Number.isNaN(timeB) ? Number.NEGATIVE_INFINITY : timeB) -
      (Number.isNaN(timeA) ? Number.NEGATIVE_INFINITY : timeA);
  });
}
