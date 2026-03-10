import { getCollection, type CollectionEntry } from 'astro:content';
import { lanes, stars } from '../data/galaxy';
import type { NodeFrontmatter } from '../types/galaxy';
import { hydrateGalaxy, type HydratedGalaxy } from './galaxy-model';

export interface GalaxyData extends HydratedGalaxy {
  lanes: typeof lanes;
}

function mapNodeEntry(entry: CollectionEntry<'nodes'>): NodeFrontmatter {
  return {
    ...entry.data,
    slug: entry.slug,
  };
}

export async function getGalaxyNodeEntries() {
  if (!galaxyNodeEntriesPromise) {
    galaxyNodeEntriesPromise = getCollection('nodes').catch((error) => {
      galaxyNodeEntriesPromise = undefined;
      throw error;
    });
  }

  return galaxyNodeEntriesPromise;
}

export async function getGalaxyData() {
  if (!galaxyDataPromise) {
    galaxyDataPromise = loadGalaxyData().catch((error) => {
      galaxyDataPromise = undefined;
      throw error;
    });
  }

  return galaxyDataPromise;
}

export function clearGalaxyDataCache() {
  galaxyDataPromise = undefined;
  galaxyNodeEntriesPromise = undefined;
}

async function loadGalaxyData(): Promise<GalaxyData> {
  const entries = await getGalaxyNodeEntries();
  const nodes = entries.map(mapNodeEntry);

  return {
    ...hydrateGalaxy(stars, nodes),
    lanes,
  };
}

let galaxyDataPromise: Promise<GalaxyData> | undefined;
let galaxyNodeEntriesPromise: Promise<CollectionEntry<'nodes'>[]> | undefined;
