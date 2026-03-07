# Digital Garden Dyson Galaxy

一个基于 Astro 的数字花园 MVP：包含 Three.js 星系枢纽、真实 Markdown 文章路由、ACG 画廊路由，以及由后端驱动并返回结构化导航动作的 AI 终端。

## 当前能力

- 3D 星系枢纽首页：`/`
- Markdown 文章路由：`/read/[starId]/[planetId]/[slug]`
- 画廊路由：`/gallery/[starId]/[planetId]`
- 本地星系结构：`src/data/galaxy.ts`
- Markdown 内容：`src/content/nodes/...`
- 规则匹配 AI 接口：`/api/agent`

## 本地命令

请在项目根目录执行：

```bash
npm install
npm run dev
npm run check
npm run test
npm run test:e2e
npm run build
```

命令说明：

- `npm run dev`：启动 Astro 开发服务器
- `npm run check`：执行 Astro 类型检查与内容校验
- `npm run test`：执行 Vitest 单元测试
- `npm run test:e2e`：执行 Playwright 端到端烟测（本地 Astro 服务）
- `npm run build`：生成生产构建产物到 `dist/`

## 内容模型

Markdown 节点位于：`src/content/nodes/...`。

当前 frontmatter 字段：

- `title`
- `starId`
- `planetId`
- `summary`
- `tags`
- `publishedAt`
- `heroImage`

重要说明：

- Astro 将 `slug` 作为条目元数据保留字段，因此文章路由应读取 `entry.slug`，而不是 `entry.data.slug`。

## 路由约定

文章路由采用语义化层级路径：

```text
/read/tech/p_garden/why-3d-galaxy
```

画廊路由按星系与行星 id 组织：

```text
/gallery/acg/p_gallery
```

## 数据来源

当前 MVP 仅使用本地数据源：

- `src/data/galaxy.ts`：恒星、行星、航道、别名、公转参数
- `src/content/nodes/...`：真实 Markdown 内容
- `src/lib/galaxy-data.ts`：供路由、Hub 与 API 复用的数据聚合层

Supabase、RAG 与同步任务暂时后置，待 MVP 稳定后再接入。

## 项目说明

为发布前整理，历史资料已归档到：

- HTML 原型：`docs/archive/prototypes/`
- 历史设计/实现方案：`docs/archive/plans/`
- 历史提示词与笔记：`docs/archive/notes/`
- 当前架构参考：`docs/reference/database-architecture.md`

## AI 终端

当前 AI 终端为本地规则匹配实现。

- 前端将用户输入发送到 `POST /api/agent`
- 后端匹配恒星或行星别名
- 后端返回 `{ message, action }`
- 前端派发 `galaxy:action`，场景层执行导航

项目采用 Astro `server` 输出模式 + Node 适配器，保证开发、测试与构建阶段的本地 AI API 都是实际后端路由。

返回示例：

```json
{
  "message": "已锁定数字花园日志，准备切入近地轨道。",
  "action": {
    "type": "TELEPORT",
    "targetType": "planet",
    "targetId": "p_garden"
  }
}
```

即使后续替换为真实 Agent 层，也应保持该响应契约稳定。
