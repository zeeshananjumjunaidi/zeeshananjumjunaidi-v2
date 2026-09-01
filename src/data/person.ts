// One Person node, referenced by @id from every other schema on the site.
// Without a stable @id each page declares its own inline author object, so a
// crawler sees several unconnected people rather than one entity who works
// somewhere, built the Lab tools and wrote the articles.

export const PERSON_ID = 'https://zeeshananjum.com/#person';

export const personSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': PERSON_ID,
  name: 'Zeeshan Anjum Junaidi',
  url: 'https://zeeshananjum.com',
  image: 'https://avatars.githubusercontent.com/u/17067044?v=4',
  jobTitle: 'Senior Software Engineer',
  description:
    'Senior software engineer based in Karachi, working on infrastructure and platform engineering. Builds simulation engines and interactive technical tools outside of work.',
  worksFor: {
    '@type': 'Organization',
    name: 'IDWise',
  },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Karachi',
    addressCountry: 'PK',
  },
  sameAs: [
    'https://github.com/zeeshananjumjunaidi',
    'https://www.linkedin.com/in/zeeshananjum/',
  ],
  // Deliberately the professional ground, not the Lab's subject matter. The
  // Lab is personal exploration, and listing SLAM or guidance here would let
  // a machine read it as employment experience.
  knowsAbout: [
    'Infrastructure Engineering',
    'Platform Engineering',
    'Kubernetes',
    'Terraform',
    'Amazon Web Services',
    'Google Cloud Platform',
    'CI/CD',
    'Network Security',
    'Backend Development',
    'Distributed Systems',
    'Python',
    'TypeScript',
  ],
};

// Every other schema points here instead of repeating the person inline.
export const authorRef = { '@id': PERSON_ID };
