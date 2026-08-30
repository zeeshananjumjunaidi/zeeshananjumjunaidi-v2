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
    slug: 'transactional-outbox',
    title: 'The transactional outbox',
    description:
      'Writing to your database and publishing an event cannot both succeed. What the outbox really buys you, and the ordering bug most implementations ship with.',
    topics: ['Distributed Systems', 'Architecture', 'Data & Storage'],
    publishDate: new Date('2026-08-30'),
  },
  {
    slug: 'tsiolkovsky-rocket-equation',
    title: 'The Tsiolkovsky rocket equation',
    description:
      'Why rockets are almost entirely fuel tank: deriving the rocket equation from momentum conservation, and what it means for staging, engine choice and propulsive landing.',
    topics: ['Physics', 'Orbital Mechanics', 'Propulsion'],
    publishDate: new Date('2026-08-30'),
  },
];
