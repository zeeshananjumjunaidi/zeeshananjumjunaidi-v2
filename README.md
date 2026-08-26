# zeeshananjum.com (v2)

[![Deploy to GitHub Pages](https://github.com/zeeshananjumjunaidi/zeeshananjumjunaidi-v2/actions/workflows/deploy.yml/badge.svg)](https://github.com/zeeshananjumjunaidi/zeeshananjumjunaidi-v2/actions/workflows/deploy.yml)

My personal site, rebuilt in Astro. It's a static site, deployed to GitHub Pages at [zeeshananjum.com](https://zeeshananjum.com).

## Stack

- [Astro](https://astro.build)
- Plain CSS custom properties for the dark/light theme, no Tailwind
- Content collections for the Lab entries
- pnpm
- Claude Code

## Running it locally

```bash
pnpm install
pnpm dev
```

To build:

```bash
pnpm build
```

The site comes out fully static in `dist/`.

## Layout

- `src/pages` - routes. Just the homepage and `/lab/[slug]` for now.
- `src/components` - the pieces the homepage is built from, plus the ported lab sims under `components/labs`.
- `src/content/lab` - one JSON file per Lab entry, whether it's a link to a repo or a live tool.
- `src/data/labs.ts` - metadata for the interactive sims (title, tagline, writeup).
- `src/styles/global.css` - the whole design system, both themes, as CSS custom properties.

## The Lab

Interactive tools get added one at a time, ported over from an older personal project and retouched to fit this site's look. To add one: drop the component in `src/components/labs`, add an entry to `src/data/labs.ts`, and a matching JSON file in `src/content/lab`.
