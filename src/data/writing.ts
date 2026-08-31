// An entry normally needs a component in src/components/writing/ and a slug
// mapping in src/pages/writing/[slug].astro. The exception is an entry with
// `href`, which is a piece that already lives somewhere else on the site and
// only needs listing here.

export interface WritingEntry {
  slug: string;
  title: string;
  description: string;
  topics: string[];
  /** Shown as the standfirst and in the index, so length is an editorial
   *  choice. Set `metaDescription` when it runs past ~160 characters and
   *  search results would truncate it. Same split the labs use. */
  metaDescription?: string;
  publishDate: Date;
  draft?: boolean;
  /** Set when the piece lives outside /writing/<slug>. Such entries are
   *  listed on the writing page but no page is generated for them. */
  href?: string;
  /** Short note on where it actually lives, shown beside the title. */
  where?: string;
  /** Set when the article supplies its own layout instead of the centred
   *  reading measure that .writing-prose imposes. */
  wide?: boolean;
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
    metaDescription:
      'Why rockets are almost entirely fuel tank: deriving the rocket equation from momentum conservation, and what it means for staging and engine choice.',
    topics: ['Physics', 'Orbital Mechanics', 'Propulsion'],
    publishDate: new Date('2026-08-30'),
  },
  {
    slug: 'landing-a-booster',
    title: 'Landing a Booster',
    description:
      'What it takes to put a returning first stage back on a pad: the state worth tracking, the forces acting on it, the two actuators that steer it, and the guidance law that decides when to light the engine.',
    topics: ['Physics', 'Control Systems', 'Simulation'],
    publishDate: new Date('2026-08-28'),
    // Brings its own two-column layout (reading column plus a margin rail),
    // so the route renders it outside the usual .writing-prose measure.
    wide: true,
  },
];
