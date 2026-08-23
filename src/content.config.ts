import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const lab = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/lab' }),
  schema: z.object({
    title: z.string(),
    href: z.string().url(),
    category: z.string(),
    year: z.string(),
    description: z.string().optional(),
    preview: z.enum(['radar', 'turret', 'bars', 'grid']).optional(),
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
