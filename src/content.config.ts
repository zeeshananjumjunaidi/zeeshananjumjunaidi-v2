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
    preview: z.enum(['radar', 'turret', 'bars', 'grid', 'vehicle']).optional(),
    featured: z.boolean().default(false),
    group: z.string().optional(),
    order: z.number().default(0),
  }),
});

const writing = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    topics: z.array(z.string()).default([]),
    publishDate: z.date().optional(),
    draft: z.boolean().default(true),
  }),
});

export const collections = { lab, writing };
