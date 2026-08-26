// Display labels for the Lab's `domain` grouping (src/content.config.ts).
// A domain with no entry here still renders fine -- titleCase() covers it --
// add a label whenever a new domain shows up often enough to earn one.
const domainLabels: Record<string, string> = {
  'systems-design': 'Systems Design',
  robotics: 'Robotics',
};

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function domainLabel(domain: string): string {
  return domainLabels[domain] ?? titleCase(domain);
}
