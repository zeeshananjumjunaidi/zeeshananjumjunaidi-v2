import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://zeeshananjum.com',
  integrations: [sitemap()],
  markdown: {
    // Shiki writes its theme colours as an inline style, which no stylesheet
    // can override -- the default github-dark left every code block a dark
    // slab on a light page. 'css-variables' makes it emit var() references
    // instead, defined from this site's own tokens in global.css so code
    // follows the light/dark toggle like everything else.
    shikiConfig: { theme: 'css-variables', wrap: false },
  },
});
