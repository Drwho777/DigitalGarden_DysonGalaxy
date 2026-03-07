export interface GalleryExhibit {
  title: string;
  tag: string;
  summary: string;
  image: string;
  accent: string;
  featured?: boolean;
}

const galleryExhibitsByPlanetId: Record<string, GalleryExhibit[]> = {
  p_gallery: [
    {
      title: '攻壳机动队',
      tag: 'CYBERPUNK / IDENTITY',
      summary:
        '当网络覆盖全球、肉体可以被义体替换时，灵魂的边界究竟还剩下什么。',
      image: '/images/hero-cyberspace.svg',
      accent: 'text-[var(--accent-green)]',
      featured: true,
    },
    {
      title: '新世纪福音战士',
      tag: 'MECHA / PHILOSOPHY',
      summary:
        'AT 力场、补完计划与亲密关系失效之后的自我保全。',
      image: '/images/hero-performance.svg',
      accent: 'text-[var(--accent-violet)]',
    },
    {
      title: '数字残响档案',
      tag: 'CURATION / MEMORY',
      summary:
        '把动画、漫画与视觉碎片整理成可以反复进入的情绪地图。',
      image: '/images/hero-garden.svg',
      accent: 'text-[var(--accent-cyan)]',
    },
  ],
};

export function getGalleryExhibits(planetId: string): GalleryExhibit[] {
  return galleryExhibitsByPlanetId[planetId] ?? [];
}
