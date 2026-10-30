import { config, fields, singleton } from '@keystatic/core';

export default config({
  storage: { kind: 'local' },
  singletons: {
    newsSettings: singleton({
      label: 'News settings',
      path: 'src/data/news-settings',
      format: { data: 'json' },
      schema: {
        categories: fields.array(
          fields.object({
            name: fields.text({ label: 'Category', validation: { isRequired: true } }),
            enabled: fields.checkbox({ label: 'Enabled', defaultValue: true }),
            sources: fields.array(
              fields.object({
                enabled: fields.checkbox({ label: 'Enabled', defaultValue: true }),
                name: fields.text({ label: 'Source name', validation: { isRequired: true } }),
                url: fields.url({ label: 'Feed URL', validation: { isRequired: true } }),
                kind: fields.select({
                  label: 'Feed type',
                  options: [
                    { label: 'RSS / Atom', value: 'rss' },
                    { label: 'Hacker News', value: 'hackernews' },
                    { label: 'Now News', value: 'nownews' },
                    { label: 'WordPress.com API', value: 'wordpress' },
                  ],
                  defaultValue: 'rss',
                }),
                role: fields.select({
                  label: 'Display role',
                  options: [
                    { label: 'None', value: '' },
                    { label: 'Curator', value: 'curator' },
                    { label: 'Community', value: 'community' },
                    { label: 'Publisher', value: 'publisher' },
                  ],
                  defaultValue: '',
                }),
              }),
              {
                label: 'Sources — drag to reorder',
                itemLabel: ({ fields }) => fields.name.value || 'New source',
              },
            ),
          }),
          {
            label: 'Categories — drag to reorder; open a category to manage its sources',
            itemLabel: ({ fields }) => fields.name.value || 'New category',
          },
        ),
      },
    }),
  },
});
