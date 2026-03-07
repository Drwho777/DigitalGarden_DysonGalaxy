import type { GalaxyLane, StarConfig } from '../types/galaxy';

export const stars: StarConfig[] = [
  {
    id: 'tech',
    name: '工程与架构',
    description: '关于前端架构、系统设计与性能优化的长期记录。',
    color: '#FF4500',
    position: [0, 0, 0],
    aliases: ['tech', '技术', '工程', '架构'],
    planets: [
      {
        id: 'p_garden',
        starId: 'tech',
        name: '数字花园日志',
        description: '记录构建 3D 交互博客的全过程。',
        pageType: 'article_list',
        orbitDistance: 60,
        orbitSpeed: 0.008,
        tilt: 0.2,
        color: '#FF8C00',
        aliases: ['garden', '数字花园', '花园日志'],
      },
    ],
  },
  {
    id: 'phil',
    name: '哲学思辨',
    description: '从虚无主义到存在主义的个人思想碎片。',
    color: '#9370DB',
    position: [350, 100, -200],
    aliases: ['phil', '哲学', '思辨'],
    planets: [
      {
        id: 'p_exist',
        starId: 'phil',
        name: '存在主义笔记',
        description: '萨特与加缪的阅读感悟。',
        pageType: 'article_list',
        orbitDistance: 50,
        orbitSpeed: 0.01,
        tilt: 0.5,
        color: '#DA70D6',
        aliases: ['存在主义', 'exist', '存在主义笔记'],
      },
    ],
  },
  {
    id: 'acg',
    name: 'ACG 档案库',
    description: '神作补完计划与动画叙事分析。',
    color: '#00FA9A',
    position: [-300, -150, 250],
    aliases: ['acg', '动画', '二次元'],
    planets: [
      {
        id: 'p_gallery',
        starId: 'acg',
        name: '阿卡夏幻影展馆',
        description: 'ACG 互动画廊与视觉档案。',
        pageType: 'gallery',
        orbitDistance: 72,
        orbitSpeed: 0.006,
        tilt: -0.15,
        color: '#00FA9A',
        aliases: ['展馆', '画廊', 'gallery'],
      },
    ],
  },
];

export const lanes: GalaxyLane[] = [
  { from: 'tech', to: 'phil' },
  { from: 'tech', to: 'acg' },
  { from: 'phil', to: 'acg' },
];
