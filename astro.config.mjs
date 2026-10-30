import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'personal-news-digest';
const isUserSite = repository.endsWith('.github.io');
const isDevCommand = process.argv.includes('dev');

export default defineConfig({
  site: process.env.GITHUB_REPOSITORY
    ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0]}.github.io`
    : 'http://localhost:4321',
  base: !process.env.GITHUB_REPOSITORY || isUserSite ? '/' : `/${repository}`,
  devToolbar: { enabled: false },
  integrations: isDevCommand ? [react(), keystatic()] : [],
  vite: {
    plugins: [tailwindcss()],
  },
});
