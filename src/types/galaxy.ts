export type PlanetPageType = 'article_list' | 'gallery';

export interface GalaxyLane {
  from: string;
  to: string;
}

export interface PlanetConfig {
  id: string;
  starId: string;
  name: string;
  description: string;
  pageType: PlanetPageType;
  orbitDistance: number;
  orbitSpeed: number;
  tilt: number;
  color: string;
  aliases: string[];
}

export interface StarConfig {
  id: string;
  name: string;
  description: string;
  color: string;
  position: [number, number, number];
  aliases: string[];
  planets: PlanetConfig[];
}

export interface NodeFrontmatter {
  title: string;
  slug: string;
  starId: string;
  planetId: string;
  summary: string;
  tags: string[];
  publishedAt: Date;
  heroImage: string;
}
