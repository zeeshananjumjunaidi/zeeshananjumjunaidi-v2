import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://zeeshananjum.com',
  integrations: [sitemap()],
  markdown: {
    // Shiki writes theme colours inline, which no stylesheet can override.
    // 'css-variables' makes it emit var() refs, defined in global.css.
    shikiConfig: { theme: 'css-variables', wrap: false },
  },
});
