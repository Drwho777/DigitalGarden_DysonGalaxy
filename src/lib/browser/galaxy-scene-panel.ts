import type { HydratedPlanet, HydratedStar } from '../galaxy-model';

interface PanelRenderOptions {
  open?: boolean;
}

interface PanelElements {
  content: HTMLElement | null;
  meta: HTMLElement | null;
  panel: HTMLElement | null;
  subtitle: HTMLElement | null;
  tag: HTMLElement | null;
  title: HTMLElement | null;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    textContent?: string;
  } = {},
) {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.textContent !== undefined) {
    element.textContent = options.textContent;
  }

  return element;
}

function createPanelCard(
  label: string,
  description: string,
  className: string,
) {
  const card = createElement('div', { className });
  const heading = createElement('p', {
    className:
      'font-mono text-xs uppercase tracking-[0.3em] text-slate-500',
    textContent: label,
  });
  const body = createElement('p', {
    className: 'mt-3 leading-7 text-slate-300',
    textContent: description,
  });

  card.append(heading, body);
  return card;
}

function createPlanetSummaryItem(planet: HydratedPlanet) {
  const item = createElement('li', {
    className: 'rounded-2xl border border-white/10 bg-black/20 p-4',
  });
  const header = createElement('div', {
    className: 'flex items-center justify-between gap-3',
  });
  const type = createElement('span', {
    className:
      'font-mono text-xs uppercase tracking-[0.24em] text-[var(--accent-orange)]',
    textContent: planet.pageType === 'gallery' ? 'Gallery' : 'Article List',
  });
  const count = createElement('span', {
    className: 'text-xs text-slate-500',
    textContent: `${planet.nodeCount} nodes`,
  });
  const title = createElement('h3', {
    className: 'mt-3 text-base font-semibold text-white',
    textContent: planet.name,
  });
  const description = createElement('p', {
    className: 'mt-2 text-sm leading-6 text-slate-400',
    textContent: planet.description,
  });

  header.append(type, count);
  item.append(header, title, description);
  return item;
}

function createArticleNodeItem(article: HydratedPlanet['articles'][number]) {
  const listItem = createElement('li');
  const link = createElement('a', {
    className:
      'block rounded-2xl border border-white/10 bg-black/20 p-4 transition-colors hover:border-[var(--accent-cyan)]/40 hover:bg-[rgba(0,191,255,0.08)]',
  });
  const title = createElement('h3', {
    className: 'text-base font-semibold text-white',
    textContent: article.title,
  });
  const summary = createElement('p', {
    className: 'mt-2 text-sm leading-6 text-slate-400',
    textContent: article.summary,
  });

  link.href = article.href;
  link.append(title, summary);
  listItem.append(link);
  return listItem;
}

function getPanelElements(): PanelElements {
  return {
    panel: document.getElementById('info-panel'),
    tag: document.getElementById('info-panel-tag'),
    meta: document.getElementById('info-panel-meta'),
    title: document.getElementById('info-panel-title'),
    subtitle: document.getElementById('info-panel-subtitle'),
    content: document.getElementById('info-panel-content'),
  };
}

export function createPanelRenderer() {
  const elements = getPanelElements();
  let isOpen = false;

  function setOpen(nextOpen: boolean) {
    isOpen = nextOpen;

    if (!elements.panel) {
      return;
    }

    elements.panel.classList.toggle('hidden', !nextOpen);
    elements.panel.classList.toggle('flex', nextOpen);
  }

  function openPanel() {
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
  }

  function syncPanelVisibility(open = true) {
    if (open) {
      openPanel();
      return;
    }

    closePanel();
  }

  function renderStar(
    star: HydratedStar,
    options: PanelRenderOptions = {},
  ) {
    const { content, meta, subtitle, tag, title } = elements;
    if (!tag || !meta || !title || !subtitle || !content) {
      return;
    }

    tag.textContent = `STAR // ${star.id.toUpperCase()}`;
    meta.textContent = `TOTAL_NODES // ${star.totalNodes}`;
    title.textContent = star.name;
    subtitle.textContent = star.description;

    const systemBrief = createPanelCard(
      'System Brief',
      `进入 ${star.name} 的中心引力场后，你可以继续点击行星，查看该领域下的具体专题入口。`,
      'rounded-2xl border border-[var(--accent-cyan)]/20 bg-[rgba(0,191,255,0.08)] p-4',
    );
    const planetsSection = createElement('div');
    const sectionTitle = createElement('p', {
      className:
        'mb-3 font-mono text-xs uppercase tracking-[0.3em] text-slate-500',
      textContent: 'Orbiting Planets',
    });
    const list = createElement('ul', { className: 'space-y-3' });

    if (star.planets.length > 0) {
      list.append(...star.planets.map(createPlanetSummaryItem));
    } else {
      list.append(
        createElement('li', {
          className:
            'rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-slate-500',
          textContent: '当前星系下还没有登记行星。',
        }),
      );
    }

    planetsSection.append(sectionTitle, list);
    content.replaceChildren(systemBrief, planetsSection);
    syncPanelVisibility(options.open);
  }

  function renderPlanet(
    planet: HydratedPlanet,
    parentStar: HydratedStar,
    options: PanelRenderOptions = {},
  ) {
    const { content, meta, subtitle, tag, title } = elements;
    if (!tag || !meta || !title || !subtitle || !content) {
      return;
    }

    tag.textContent = `PLANET // ${planet.id.toUpperCase()}`;
    meta.textContent =
      planet.pageType === 'gallery'
        ? 'MODE // GALLERY'
        : `ARTICLES // ${planet.nodeCount}`;
    title.textContent = planet.name;
    subtitle.textContent = `${planet.description} / 所属星系：${parentStar.name}`;

    const body: HTMLElement[] = [
      createPanelCard(
        'Status',
        `摄像机已锁定 ${planet.name} 轨道，你现在可以进入该专题的实际内容页面。`,
        'rounded-2xl border border-white/10 bg-black/20 p-4',
      ),
    ];

    if (planet.pageType === 'gallery') {
      const galleryLink = createElement('a', {
        className:
          'block rounded-2xl border border-[var(--accent-green)]/30 bg-[rgba(0,250,154,0.08)] p-4 transition-colors hover:border-[var(--accent-green)] hover:bg-[rgba(0,250,154,0.12)]',
      });
      const galleryLabel = createElement('p', {
        className:
          'font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent-green)]',
        textContent: 'Open Gallery',
      });
      const galleryTitle = createElement('h3', {
        className: 'mt-3 text-lg font-semibold text-white',
        textContent: planet.name,
      });
      const galleryDescription = createElement('p', {
        className: 'mt-2 text-sm leading-6 text-slate-300',
        textContent: '进入 ACG 视觉档案与交互画廊页面。',
      });

      galleryLink.href = `/gallery/${planet.starId}/${planet.id}`;
      galleryLink.append(galleryLabel, galleryTitle, galleryDescription);
      body.push(galleryLink);
    } else if (planet.articles.length > 0) {
      const articleSection = createElement('div');
      const articleLabel = createElement('p', {
        className:
          'mb-3 font-mono text-xs uppercase tracking-[0.3em] text-slate-500',
        textContent: 'Article Nodes',
      });
      const articleList = createElement('ul', { className: 'space-y-3' });

      articleList.append(...planet.articles.map(createArticleNodeItem));
      articleSection.append(articleLabel, articleList);
      body.push(articleSection);
    } else {
      body.push(
        createElement('div', {
          className:
            'rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-slate-500',
          textContent: '这个专题已经注册，但当前还没有文章节点。',
        }),
      );
    }

    content.replaceChildren(...body);
    syncPanelVisibility(options.open);
  }

  return {
    closePanel,
    isOpen: () => isOpen,
    openPanel,
    renderPlanet,
    renderStar,
  };
}
