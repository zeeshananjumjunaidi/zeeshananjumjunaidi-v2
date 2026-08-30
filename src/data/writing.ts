// Each entry needs a component in src/components/writing/ and a slug mapping
// in src/pages/writing/[slug].astro.

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
