import { defineConfig } from 'astro/config';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'personal-news-digest';
const isUserSite = repository.endsWith('.github.io');

export default defineConfig({
  site: process.env.GITHUB_REPOSITORY
    ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0]}.github.io`
    : 'http://localhost:4321',
  base: isUserSite ? '/' : `/${repository}`,
});
