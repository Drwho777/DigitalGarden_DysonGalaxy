create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'planet_page_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.planet_page_type as enum ('article_list', 'gallery');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.stars (
  id text primary key,
  name text not null,
  description text not null,
  color text not null,
  position_x double precision not null,
  position_y double precision not null,
  position_z double precision not null,
  total_nodes integer not null default 0,
  aliases text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.planets (
  id text primary key,
  star_id text not null references public.stars (id) on delete cascade,
  name text not null,
  description text not null,
  page_type public.planet_page_type not null,
  orbit_distance double precision not null,
  orbit_speed double precision not null,
  tilt double precision not null,
  color text not null,
  node_count integer not null default 0,
  aliases text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (star_id, id)
);

create table if not exists public.galaxy_lanes (
  from_star_id text not null references public.stars (id) on delete cascade,
  to_star_id text not null references public.stars (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (from_star_id, to_star_id),
  constraint galaxy_lanes_direction_check check (from_star_id <> to_star_id)
);

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  star_id text not null references public.stars (id) on delete restrict,
  planet_id text not null,
  slug text not null,
  title text not null,
  summary text not null,
  tags text[] not null default '{}',
  published_at date not null,
  hero_image text not null,
  content_raw text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint nodes_star_planet_slug_key unique (star_id, planet_id, slug),
  constraint nodes_planet_fk
    foreign key (star_id, planet_id)
    references public.planets (star_id, id)
    on delete restrict
);

create table if not exists public.node_embeddings (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content_chunk text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint node_embeddings_node_chunk_key unique (node_id, chunk_index)
);

alter table public.stars
  add column if not exists total_nodes integer not null default 0;

alter table public.planets
  add column if not exists node_count integer not null default 0;

comment on table public.node_embeddings is
  'Private pgvector store used by server-side RAG workflows.';

create or replace function public.refresh_galaxy_counts(
  target_star_ids text[] default '{}',
  target_planet_ids text[] default '{}'
)
returns void
language plpgsql
as $$
begin
  if coalesce(array_length(target_planet_ids, 1), 0) > 0 then
    update public.planets as planets
    set node_count = counts.node_count
    from (
      select
        planets.star_id,
        planets.id,
        count(nodes.id)::integer as node_count
      from public.planets as planets
      left join public.nodes as nodes
        on nodes.star_id = planets.star_id
       and nodes.planet_id = planets.id
      where planets.id = any (target_planet_ids)
      group by planets.star_id, planets.id
    ) as counts
    where planets.star_id = counts.star_id
      and planets.id = counts.id;
  end if;

  if coalesce(array_length(target_star_ids, 1), 0) > 0 then
    update public.stars as stars
    set total_nodes = counts.total_nodes
    from (
      select
        stars.id,
        count(nodes.id)::integer as total_nodes
      from public.stars as stars
      left join public.nodes as nodes
        on nodes.star_id = stars.id
      where stars.id = any (target_star_ids)
      group by stars.id
    ) as counts
    where stars.id = counts.id;
  end if;
end;
$$;

create or replace function public.sync_galaxy_counts_from_nodes()
returns trigger
language plpgsql
as $$
declare
  target_star_ids text[] := '{}';
  target_planet_ids text[] := '{}';
begin
  if tg_op = 'UPDATE'
     and old.star_id is not distinct from new.star_id
     and old.planet_id is not distinct from new.planet_id then
    return null;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    target_star_ids := array_append(target_star_ids, new.star_id);
    target_planet_ids := array_append(target_planet_ids, new.planet_id);
  end if;

  if tg_op in ('DELETE', 'UPDATE') then
    target_star_ids := array_append(target_star_ids, old.star_id);
    target_planet_ids := array_append(target_planet_ids, old.planet_id);
  end if;

  perform public.refresh_galaxy_counts(
    array(
      select distinct value
      from unnest(target_star_ids) as value
      where value is not null
    ),
    array(
      select distinct value
      from unnest(target_planet_ids) as value
      where value is not null
    )
  );

  return null;
end;
$$;

create index if not exists planets_star_id_idx on public.planets (star_id);
create index if not exists nodes_planet_id_idx on public.nodes (planet_id);
create index if not exists nodes_published_at_idx on public.nodes (published_at desc);
create index if not exists node_embeddings_node_id_idx on public.node_embeddings (node_id);
create index if not exists node_embeddings_embedding_idx
  on public.node_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

drop trigger if exists set_stars_updated_at on public.stars;
create trigger set_stars_updated_at
before update on public.stars
for each row
execute function public.set_updated_at();

drop trigger if exists set_planets_updated_at on public.planets;
create trigger set_planets_updated_at
before update on public.planets
for each row
execute function public.set_updated_at();

drop trigger if exists set_nodes_updated_at on public.nodes;
create trigger set_nodes_updated_at
before update on public.nodes
for each row
execute function public.set_updated_at();

drop trigger if exists sync_galaxy_counts_from_nodes on public.nodes;
create trigger sync_galaxy_counts_from_nodes
after insert or update or delete on public.nodes
for each row
execute function public.sync_galaxy_counts_from_nodes();

alter table public.stars enable row level security;
alter table public.planets enable row level security;
alter table public.galaxy_lanes enable row level security;
alter table public.nodes enable row level security;
alter table public.node_embeddings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'stars'
      and policyname = 'Public read stars'
  ) then
    create policy "Public read stars"
      on public.stars
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'planets'
      and policyname = 'Public read planets'
  ) then
    create policy "Public read planets"
      on public.planets
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'galaxy_lanes'
      and policyname = 'Public read galaxy lanes'
  ) then
    create policy "Public read galaxy lanes"
      on public.galaxy_lanes
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'nodes'
      and policyname = 'Public read nodes'
  ) then
    create policy "Public read nodes"
      on public.nodes
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

-- Intentionally no anon/authenticated policy for node_embeddings.
-- Vector data stays private and should be queried server-side with service-role access.

insert into public.stars (
  id,
  name,
  description,
  color,
  position_x,
  position_y,
  position_z,
  aliases
)
values
  (
    'tech',
    '工程与架构',
    '关于前端架构、系统设计与性能优化的长期记录。',
    '#FF4500',
    0,
    0,
    0,
    array['tech', '技术', '工程', '架构']
  ),
  (
    'phil',
    '哲学思辨',
    '从虚无主义到存在主义的个人思想碎片。',
    '#9370DB',
    350,
    100,
    -200,
    array['phil', '哲学', '思辨']
  ),
  (
    'acg',
    'ACG 档案库',
    '神作补完计划与动画叙事分析。',
    '#00FA9A',
    -300,
    -150,
    250,
    array['acg', '动画', '二次元']
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  color = excluded.color,
  position_x = excluded.position_x,
  position_y = excluded.position_y,
  position_z = excluded.position_z,
  aliases = excluded.aliases;

insert into public.planets (
  id,
  star_id,
  name,
  description,
  page_type,
  orbit_distance,
  orbit_speed,
  tilt,
  color,
  aliases
)
values
  (
    'p_garden',
    'tech',
    '数字花园日志',
    '记录构建 3D 交互博客的全过程。',
    'article_list',
    60,
    0.008,
    0.2,
    '#FF8C00',
    array['garden', '数字花园', '花园日志']
  ),
  (
    'p_exist',
    'phil',
    '存在主义笔记',
    '萨特与加缪的阅读感悟。',
    'article_list',
    50,
    0.01,
    0.5,
    '#DA70D6',
    array['存在主义', 'exist', '存在主义笔记']
  ),
  (
    'p_gallery',
    'acg',
    '阿卡夏幻影展馆',
    'ACG 互动画廊与视觉档案。',
    'gallery',
    72,
    0.006,
    -0.15,
    '#00FA9A',
    array['展馆', '画廊', 'gallery']
  )
on conflict (id) do update
set
  star_id = excluded.star_id,
  name = excluded.name,
  description = excluded.description,
  page_type = excluded.page_type,
  orbit_distance = excluded.orbit_distance,
  orbit_speed = excluded.orbit_speed,
  tilt = excluded.tilt,
  color = excluded.color,
  aliases = excluded.aliases;

insert into public.galaxy_lanes (from_star_id, to_star_id)
values
  ('tech', 'phil'),
  ('tech', 'acg'),
  ('phil', 'acg')
on conflict (from_star_id, to_star_id) do nothing;

insert into public.nodes (
  star_id,
  planet_id,
  slug,
  title,
  summary,
  tags,
  published_at,
  hero_image,
  content_raw
)
values
  (
    'tech',
    'p_garden',
    'why-3d-galaxy',
    '从平面到宇宙：为什么我选择 3D 星系作为知识结构？',
    '用宇宙隐喻重建个人知识系统的第一性原理。',
    array['Astro', 'Three.js', 'Knowledge Graph'],
    date '2026-03-06',
    '/images/hero-garden.svg',
    $md$
传统博客默认使用时间线来组织内容，它擅长记录“先发生了什么、再发生了什么”，却不擅长表达“哪些概念彼此牵引、哪些主题长期共振”。对一个同时写工程、哲学和 ACG 的人来说，这种线性结构很快就会失真。

## 我真正想表达的不是归档，而是引力

当一篇文章只被放进分类目录时，它和其他内容的关系会被压缩得过于单薄。换成星系结构以后，信息的直觉立刻不一样了：

- 恒星代表长期稳定的大主题。
- 行星代表围绕某个问题持续累积的专题。
- 节点代表文章或碎片，它们才是真正被不断引用、重组和扩展的知识单位。

这种模型的价值不只是“看起来更酷”，而是它天然允许空间化思考。用户不再只是顺着时间滚动，而是在一个有距离、有轨道、有连接关系的系统里探索。

## 为什么是 3D，而不是更轻量的 2D 图谱

2D 图谱很适合说明连接关系，但它很难同时容纳“全局概览”“局部专题”和“节点入口”三个层次。3D 空间正好提供了一种更自然的镜头语言：

1. 远景用来看星系分布。
2. 中景用来看某个领域内部的专题轨道。
3. 近景用来看具体文章入口。

这意味着交互不再只是翻页，而是飞行。镜头移动本身就变成了信息架构的一部分。

## 对工程实现的约束

一旦把知识系统做成星系，前端就不能只追求静态排版。它至少要守住三条底线：

- 场景渲染必须足够轻，不能拖慢首屏交互。
- 路由切换要尽量无缝，避免从宇宙跳到正文时断裂。
- 数据模型要和视觉模型保持一一对应，否则 AI 和界面会各说各话。

所以这个 MVP 先让 Astro 负责路由和内容，Three.js 负责场景与交互，Markdown 负责文章本体。等这些基础稳定之后，再去接入更强的检索、推荐或大模型能力。
$md$
  ),
  (
    'tech',
    'p_garden',
    'astro-3d-performance',
    'Astro 与 Three.js 共存时，首屏性能应该先守住什么？',
    '在内容站点里引入 WebGL 时，先守住数据边界、脚本边界和渲染预算。',
    array['Astro', 'Performance', 'GSAP'],
    date '2026-03-05',
    '/images/hero-performance.svg',
    $md$
在内容站里接入 Three.js，最容易犯的错误不是“效果不够炫”，而是把所有东西都堆进一个前端巨物里。最后得到的通常不是一套场景系统，而是一块很难维护的性能泥潭。

## 第一原则：让 3D 只负责它必须负责的事

Three.js 应该管理场景、摄像机、拾取和动画；它不应该顺手接管文章正文、内容查询和复杂业务状态。只要 3D 模块开始持有太多业务数据，后续你就很难再把内容系统和视觉系统拆开。

对这个项目来说，更稳的边界是：

- Astro 负责路由、内容加载和页面骨架。
- Markdown 负责真实文章。
- Three.js 只负责宇宙可视化和交互。
- AI 终端通过结构化 `{ message, action }` 驱动场景，而不是直接侵入渲染实现。

## 第二原则：不要为了框架统一而牺牲运行时成本

很多人会本能地想把 Three.js 包进更厚的 UI 抽象里，但在一个需要长期驻留的场景里，这往往并不划算。真正需要的是一个尽量少被重建的渲染循环，而不是频繁让声明式 UI 介入底层状态。

在 Astro 里保留独立的客户端脚本入口反而更直接。页面只需要把必要数据序列化给场景层，然后由它自己维护运行时对象：

```ts
initGalaxyScene({
  stars,
  lanes,
  articlesByPlanet,
});
```

这样做的好处是，页面继续享受 Astro 的内容能力，而 3D 场景保留清晰的性能边界。

## 第三原则：一开始就对渲染预算有概念

MVP 阶段最重要的不是极致画质，而是稳定交互。具体到实现上，至少要守住这些约束：

- 控制粒子和节点数量，不让场景规模无上限膨胀。
- 给摄像机切换明确状态机，避免多重动画叠加。
- 严格区分可序列化数据和运行时对象，方便 state restore。
- 把 UI 覆盖层和 WebGL 画布分层，减少事件冲突。

先把这些基础做扎实，后面再加更丰富的材质、轨道和动态效果，成本会低很多。
$md$
  ),
  (
    'phil',
    'p_exist',
    'existential-cyberspace',
    '存在主义与赛博空间：为什么灵魂也需要一个可导航的界面？',
    '如果人通过界面理解世界，那么界面本身也在塑造人的存在感。',
    array['Philosophy', 'Cyberpunk', 'Interface'],
    date '2026-03-04',
    '/images/hero-cyberspace.svg',
    $md$
赛博空间最迷人的地方，不在于义体和霓虹，而在于它不断追问一个老问题：如果人与世界之间总隔着媒介，那么“我是谁”究竟是在经验里成立，还是在界面里成立？

## 界面不只是入口，它会反向塑造主体

我们习惯把界面理解成工具，像门、像按钮、像窗口。但只要一个人足够频繁地通过界面认识世界，界面就不再只是中介，它会改变感知的节奏、选择的顺序和记忆的权重。

这也是为什么知识系统的形状值得被认真设计。列表式界面暗示世界可以被顺序消费，而星系式界面提醒你：世界更像一个同时存在多条引力关系的结构。

## 为什么存在主义在这里依然有效

存在主义并不提供舒适答案，它更像一种提醒：不要把自己活成现成模板。放到数字空间里，这个问题会更尖锐，因为模板、推荐流和平台逻辑都在替你预设路径，而你很容易把这种被安排的顺滑误认为自由。

如果一个数字花园值得存在，它就不该只是“更酷的博客外壳”，而应该是一个能让人重新感到自己在主动导航、主动关联、主动命名的系统。

## 所以我们为什么要坚持可导航的知识宇宙

因为可导航意味着你在行动，而不只是被推送。你可以靠近一颗恒星，也可以暂时离开它；可以沉浸在一个专题里，也可以退回全景重新定位自己。

这不是技术炫技，而是一种具体的世界观表达：知识不是货架，思想不是 feed，存在也不该只剩被动接收。
$md$
  )
on conflict (star_id, planet_id, slug) do update
set
  title = excluded.title,
  summary = excluded.summary,
  tags = excluded.tags,
  published_at = excluded.published_at,
  hero_image = excluded.hero_image,
  content_raw = excluded.content_raw;

select public.refresh_galaxy_counts(
  array(select id from public.stars),
  array(select id from public.planets)
);
