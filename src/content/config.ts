import { defineCollection, z } from 'astro:content';

const nodes = defineCollection({
  schema: z.object({
    title: z.string(),
    starId: z.string(),
    planetId: z.string(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    publishedAt: z.coerce.date(),
    heroImage: z.string(),
  }),
});

export const collections = { nodes };
