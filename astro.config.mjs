import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import ogImage from './scripts/og-image.mjs';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'personal-news-digest';
const isUserSite = repository.endsWith('.github.io');
const isDevCommand = process.argv.includes('dev');

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL ?? (process.env.GITHUB_REPOSITORY
    ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0]}.github.io`
    : 'https://tab.jonlo.xyz'),
  base: process.env.SITE_BASE_PATH ?? (!process.env.GITHUB_REPOSITORY || isUserSite ? '/' : `/${repository}`),
  devToolbar: { enabled: false },
  integrations: [...(isDevCommand ? [react(), keystatic()] : []), ogImage()],
  vite: {
    plugins: [tailwindcss()],
  },
});
