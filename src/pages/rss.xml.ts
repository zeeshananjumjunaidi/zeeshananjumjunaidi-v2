import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { interactiveWriting } from '../data/writing';

export function GET(context: APIContext) {
  const items = interactiveWriting
    .filter((a) => !a.draft)
    .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime())
    .map((a) => ({
      title: a.title,
      // The standfirst, not the shortened metaDescription: a feed reader has
      // room for the full sentence and no truncation limit to respect.
      description: a.description,
      pubDate: a.publishDate,
      // An entry with `href` lives elsewhere on the site, so the feed points
      // where the writing index points rather than at a page that isn't built.
      // Resolved to absolute here because the relative form gets a trailing
      // slash appended, which lands after the fragment: `...#article/`.
      link: a.href ? new URL(a.href, context.site).toString() : `/writing/${a.slug}`,
      categories: a.topics,
    }));

  return rss({
    title: 'Zeeshan Anjum Junaidi',
    description: 'Writing on infrastructure, control, and the systems behind them.',
    site: context.site!,
    items,
    customData: '<language>en-us</language>',
  });
}
