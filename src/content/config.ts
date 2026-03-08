import { defineCollection, z } from 'astro:content';
import { stars } from '../data/galaxy';

function asNonEmptyTuple<T>(values: T[]) {
  if (values.length === 0) {
    throw new Error('Expected at least one collection value.');
  }

  return values as [T, ...T[]];
}

const starIds = asNonEmptyTuple(stars.map((star) => star.id));
const planetIds = asNonEmptyTuple(
  stars.flatMap((star) => star.planets.map((planet) => planet.id)),
);
const planetIdsByStarId = new Map(
  stars.map((star) => [
    star.id,
    new Set(star.planets.map((planet) => planet.id)),
  ]),
);

const nodes = defineCollection({
  schema: z
    .object({
      title: z.string(),
      starId: z.enum(starIds),
      planetId: z.enum(planetIds),
      summary: z.string(),
      tags: z.array(z.string()).default([]),
      publishedAt: z.coerce.date(),
      heroImage: z.string(),
    })
    .superRefine(({ planetId, starId }, context) => {
      const allowedPlanetIds = planetIdsByStarId.get(starId);

      if (!allowedPlanetIds?.has(planetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `planetId "${planetId}" does not belong to starId "${starId}".`,
          path: ['planetId'],
        });
      }
    }),
});

export const collections = { nodes };
