// Articles that need to run code -- interactive figures, canvas, controls --
// live as .astro components rather than markdown, and are registered here.
//
// Prose-only pieces still go in src/content/writing/ as markdown and need no
// entry: the route and the home listing merge both sources. Use markdown by
// default and only reach for a component when a piece actually needs one.
//
// Adding one: drop the component in src/components/writing/, add a row here,
// and map the slug in src/pages/writing/[slug].astro.

export interface WritingEntry {
  slug: string;
  title: string;
  description: string;
  topics: string[];
  publishDate: Date;
  draft?: boolean;
}

export const interactiveWriting: WritingEntry[] = [
  {
    slug: 'tsiolkovsky-rocket-equation',
    title: 'The Tsiolkovsky rocket equation',
    description:
      'Why rockets are almost entirely fuel tank: deriving the rocket equation from momentum conservation, and what it means for staging, engine choice and propulsive landing.',
    topics: ['Physics', 'Orbital Mechanics', 'Propulsion'],
    publishDate: new Date('2026-08-30'),
  },
];
