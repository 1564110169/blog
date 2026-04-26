import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

const site = process.env.SITE ?? 'https://1564110169.github.io';
const base = process.env.BASE ?? '/blog';

export default defineConfig({
  site,
  base,
  server: {
    port: 4321,
    strictPort: true
  },
  trailingSlash: 'never',
  integrations: [
    tailwind({
      applyBaseStyles: false
    }),
    mdx(),
    sitemap()
  ],
  markdown: {
    shikiConfig: {
      theme: {
        light: 'github-light',
        dark: 'github-dark'
      },
      wrap: true
    }
  }
});
