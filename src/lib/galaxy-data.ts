import { getCollection, type CollectionEntry } from 'astro:content';
import { lanes, stars } from '../data/galaxy';
import type { NodeFrontmatter } from '../types/galaxy';
import { hydrateGalaxy } from './galaxy-model';

function mapNodeEntry(entry: CollectionEntry<'nodes'>): NodeFrontmatter {
  return {
    ...entry.data,
    slug: entry.slug,
  };
}

export async function getGalaxyData() {
  const entries = await getCollection('nodes');
  const nodes = entries.map(mapNodeEntry);

  return {
    ...hydrateGalaxy(stars, nodes),
    lanes,
  };
}
