# Digital Garden Dyson Galaxy

一个基于 Astro、原生 Three.js 和 TypeScript 的数字花园实验项目。首页是可交互的 3D 戴森球星图，内容层使用 Astro Content Collections 管理 Markdown，AI 终端通过 Vercel AI SDK 调用可切换的 provider/model，并以标准化 `{ message, action }` 协议驱动星图跃迁。

## 当前能力

- 原生 Three.js 首页星图，不使用 `@react-three/fiber`
- Astro `ClientRouter` + `ViewTransitions` 页面切换
- Markdown 阅读页：`/read/[starId]/[planetId]/[slug]`
- 画廊页：`/gallery/[starId]/[planetId]`
- 基于本地星图配置的强类型内容校验
- 基于真实 Markdown 数量驱动的星体数据注入
- Provider-agnostic + tool calling 驱动的 AI 导航终端
- 首页场景支持完整 `dispose()`，可在路由往返时回收 WebGL 资源

## 技术栈

- Astro 5
- TypeScript
- Three.js
- GSAP
- Astro Content Collections
- `@astrojs/vercel`
- Vercel AI SDK
- Google Gemini / Cloudflare Workers AI（OpenAI-compatible）
- Vitest
- Playwright

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 [`.env.example`](./.env.example) 到 `.env`，然后填入你要使用的 provider 配置：

```env
AI_PROVIDER=google
AI_MODEL=gemini-2.5-flash
AI_API_KEY=your_provider_api_key_here
AI_ACCOUNT_ID=
```

说明：

- `AI_PROVIDER` 当前支持 `google` 和 `cloudflare`
- `AI_MODEL` 不填时，`google` 默认回退到 `gemini-2.5-flash`
- `cloudflare` 分支需要 `AI_ACCOUNT_ID`，并通过 OpenAI-compatible endpoint 接入
- 兼容迁移：`google` 可回退到 `GOOGLE_GENERATIVE_AI_API_KEY`，`cloudflare` 可回退到 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
- 这是服务端环境变量，只给 `/api/agent` 使用，不要写成 `PUBLIC_` 前缀
- 修改 `.env` 后需要重启开发服务

### 3. 启动开发服务

```bash
npm run dev
```

默认地址：

```text
http://127.0.0.1:4321/
```

## 可用命令

```bash
npm run dev
npm run check
npm run test
npm run test:e2e
npm run build
npm run preview
```

- `npm run dev`：启动 Astro 开发服务
- `npm run check`：运行 Astro 类型检查与内容校验
- `npm run test`：运行 Vitest 单元测试
- `npm run test:e2e`：运行 Playwright 端到端测试
- `npm run build`：构建服务端与客户端产物到 `dist/`
- `npm run preview`：本地预览构建结果

## 当前星图目录

- `tech`：工程与架构
  - `p_garden`：数字花园日志
- `phil`：哲学思辨
  - `p_exist`：存在主义笔记
- `acg`：ACG 档案库
  - `p_gallery`：阿卡夏幻影展馆

星图单一真相源位于 [src/data/galaxy.ts](./src/data/galaxy.ts)。

## 路由约定

首页：

```text
/
```

文章页示例：

```text
/read/tech/p_garden/why-3d-galaxy
```

画廊页示例：

```text
/gallery/acg/p_gallery
```

API：

```text
POST /api/agent
```

## 内容模型

Markdown 节点位于 `src/content/nodes/...`，当前 frontmatter 字段如下：

- `title`
- `starId`
- `planetId`
- `summary`
- `tags`
- `publishedAt`
- `heroImage`

内容 schema 定义在 [src/content/config.ts](./src/content/config.ts)，其中：

- `starId` 由本地星图配置派生为强校验枚举
- `planetId` 由本地星图配置派生为强校验枚举
- schema 会额外校验 `planetId` 是否隶属于对应的 `starId`

这意味着内容错误会在 `astro check` / `astro build` 阶段暴露，而不是留到运行时。

## AI 终端

当前 AI 终端已经不是简单的规则匹配，而是：

- 前端把用户输入发到 `POST /api/agent`
- 服务端在 [src/pages/api/agent.ts](./src/pages/api/agent.ts) 做请求解析
- [src/lib/agent/service.ts](./src/lib/agent/service.ts) 使用 Vercel AI SDK 调用当前配置的 provider/model
- 当用户表达“前往某个领域 / 星球 / 展馆”的意图时，模型会调用 `teleport_engine`
- 服务端把工具结果标准化为 `{ message, action }`
- 前端终端解析响应后派发 `galaxy:action`
- Three.js 场景接管实际跃迁行为

当前约定的响应格式：

```json
{
  "message": "跃迁坐标已锁定，准备执行传送。",
  "action": {
    "type": "TELEPORT",
    "targetType": "planet",
    "targetId": "p_garden"
  }
}
```

兼容说明：

- `action` 允许为 `null`
- 前端兼容旧载荷里缺失 `targetType` 的情况
- 如果 AI provider 配置缺失，接口会返回可读错误，不会静默降级

## 数据流与架构

### 1. 星图数据

- [src/data/galaxy.ts](./src/data/galaxy.ts) 定义恒星、行星、别名和轨道参数
- [src/lib/galaxy-data.ts](./src/lib/galaxy-data.ts) 聚合内容与星图
- [src/lib/galaxy-model.ts](./src/lib/galaxy-model.ts) 负责 hydration
- [src/lib/galaxy-node-stats.ts](./src/lib/galaxy-node-stats.ts) 负责从 Markdown 统计真实节点数量

### 2. Three.js 场景

- [src/lib/browser/galaxy-scene.ts](./src/lib/browser/galaxy-scene.ts) 是首页主场景入口
- [src/scripts/home-hub-bootstrap.ts](./src/scripts/home-hub-bootstrap.ts) 负责基于 Astro 生命周期挂载和销毁场景
- 页面切换前会执行显式 `dispose()`，停止 RAF、移除事件、释放 geometry / material / texture / renderer，避免 WebGL 泄漏

### 3. AI 导航

- [src/lib/browser/ai-terminal.ts](./src/lib/browser/ai-terminal.ts) 负责终端输入和响应处理
- [src/lib/agent/service.ts](./src/lib/agent/service.ts) 负责 tool calling 和目标解析
- `src/lib/ai/config.ts` + `src/lib/ai/provider.ts` 负责 provider 解析、模型创建和兼容旧环境变量
- 星系 / 行星名称、ID、别名都可以映射到真实 `targetId`

## 手动测试建议

启动开发服务后，可以直接在首页终端测试这些输入：

- `带我去工程与架构`
- `定位数字花园日志`
- `去 acg 看看`
- `带我去量子深海`

预期行为：

- 已知目标应返回 `TELEPORT` 动作并驱动镜头跃迁
- 未知目标应返回可解释的兜底响应，不应导致场景错误跳转

## 测试现状

当前项目已经覆盖以下验证链路：

- `npm run check`
- `npm run test`
- `npm run test:e2e`
- `npm run build`

Playwright 烟测覆盖了：

- 首页场景初始化
- AI 终端导航
- 首页 -> 文章页 -> 首页 的路由回切
- 浏览器前进 / 后退时的单 canvas 与无 WebGL 报错约束
- 阅读页与画廊页基础渲染

## 部署说明

当前仓库使用：

- Astro `output: 'static'`
- `@astrojs/vercel` adapter

也就是说，当前默认部署形态是 Vercel 适配器下的静态站点 + 按需 API 路由，而不是 `@astrojs/node` 的常驻 Node 服务。

如果后续要部署到 Vercel、Railway 或其他平台：

- 不要把 `AI_API_KEY`、`GOOGLE_GENERATIVE_AI_API_KEY`、`CLOUDFLARE_API_TOKEN` 暴露到前端
- 如果继续保留 Vercel 运行时，Cloudflare 分支优先走 Workers AI 的 OpenAI-compatible endpoint 或 AI Gateway
- 如需迁移兼容，可同时保留新通用变量和旧 provider 专属变量
- 确认目标平台支持当前 Astro 输出模式，或再单独切换适配器

## 历史资料

历史原型和归档资料位于：

- `docs/archive/prototypes/`
- `docs/archive/plans/`
- `docs/archive/notes/`
- `docs/reference/database-architecture.md`

## 设计约束

- 保持原生 Three.js 客户端逻辑
- 不引入 `@react-three/fiber`
- 不改变既有黑 / 青 / 橙的科幻视觉方向
- AI 导航接口长期保持 `{ message, action }` 契约稳定
