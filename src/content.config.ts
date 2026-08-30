import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const lab = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/lab' }),
  schema: z.object({
    title: z.string(),
    href: z.string(), // external URL or an internal path like /lab/slam-playground
    domain: z.string(), // top-level grouping, e.g. "systems-design", "robotics" -- see src/data/domains.ts
    category: z.string(),
    year: z.string(),
    description: z.string().optional(),
    preview: z.enum(['radar', 'turret', 'flow', 'grid', 'vehicle','rocket']).optional(),
    featured: z.boolean().default(false),
    group: z.string().optional(),
    order: z.number().default(0),
  }),
});

// Writing lives in src/data/writing.ts + src/components/writing/ instead of a
// collection: articles are .astro pages so they can carry interactive figures.
export const collections = { lab };
