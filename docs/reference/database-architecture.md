🪐 数字花园 2.0：底层架构与数据库设计白皮书

本文件确立了数字花园从底层数据到前端 3D 呈现，再到 AI Agent 交互的完整映射关系。为后续的 RAG（检索增强生成）和 Agentic UI（AI 驱动界面）打下坚实基础。

一、 系统宏观架构 (The Big Picture)

整个系统分为三大层，遵循 “单一真相源 (SSOT)” 原则：

表现层 (Frontend)：Astro (路由与 2D 页面) + Three.js (3D 星系枢纽)。负责渲染和接收用户指令。

大脑层 (Agent Layer)：基于 LangChain.js / Vercel AI SDK。它不仅仅是个聊天机器人，而是一个带有工具箱的调度系统。

记忆与资产层 (Data Layer)：

本地 Git (真相源)：所有的文章、设定都在本地以 Markdown/MDX 存储，保证数据永远属于你。

Supabase (索引与记忆)：核心数据库。包含 PostgreSQL（存结构化元数据）和 pgvector（存向量数据，用于 RAG）。

二、 核心数据库表结构 (Schema mapping to 3D)

为了让大模型准确回答“有几颗星”，我们的结构化数据库必须和 3D 宇宙完全对应。以下是 Supabase 中的核心表设计：

1. stars (恒星表 / 核心领域)

定义了宇宙中的大分类。

id: VARCHAR (主键, 如 'tech', 'acg')

name: VARCHAR (如 '工程与架构')

description: TEXT (供 LLM 理解这个领域包含什么)

color: VARCHAR (如 '#FF4500')

pos_x, pos_y, pos_z: FLOAT (在 3D 宇宙中的绝对坐标)

total_nodes: INT (冗余字段：该领域下共有多少篇文章，方便快速查询)

2. planets (行星表 / 专题项目)

围绕恒星公转的具体内容集合，也是 2D 沉浸页面的入口。

id: VARCHAR (主键, 如 'p_garden_log')

star_id: VARCHAR (外键，关联到 stars.id)

name: VARCHAR (如 '数字花园构建日志')

type: VARCHAR (枚举：article_list 文本阅读, gallery 图片画廊, 3d_model 模型展柜。决定了点击后跳转到哪种 UI)

orbit_distance: FLOAT (轨道半径)

node_count: INT (决定了 3D 视图中数据环的宽度)

3. nodes (节点表 / Markdown 文章与碎片)

知识的最小单位（戴森云碎片）。

id: UUID (主键)

planet_id: VARCHAR (外键，允许为空。为空说明是在恒星外围游荡的独立碎片)

star_id: VARCHAR (外键)

title: VARCHAR

content_raw: TEXT (Markdown 原文)

slug: VARCHAR (URL 路径)

4. node_embeddings (记忆向量表 / RAG 专用)

用于大模型语义检索（pgvector）。

id: UUID (主键)

node_id: UUID (关联到 nodes.id)

chunk_index: INT (长文章会被切成多个片段存入)

content_chunk: TEXT (文章的具体片段)

embedding: vector(1536) (OpenAI 或 Gemini 生成的向量)

三、 Agent 交互协议 (如何让 AI 控制界面？)

这是本项目最硬核的部分：Agentic UI（智能体驱动界面）。

当你在左下角聊天框输入指令时，前端和 Agent 后端的交互不仅是纯文本，而是包含**结构化命令（Commands）**的数据流。

1. Agent 的工具箱 (Tools / Function Calling)

我们给 Gemini 赋予以下几个底层工具（函数）：

get_galaxy_stats(): 执行 SQL 查询 stars 和 planets 表的 count。当用户问“现在宇宙规模多大”时，Agent 自动调用此函数获取绝对准确的数字，拒绝幻觉。

search_knowledge(query): 利用 pgvector 在 node_embeddings 表中进行向量相似度搜索，用于 RAG 问答。

trigger_teleport(target_id): 这是控制 UI 的关键。Agent 判断用户意图是“前往某处”时，调用此函数生成一条 UI 动作指令。

2. 前后端通信协议设计

前端接收到的 API 响应格式不仅仅是一句话，而是一个 JSON：

{
  "message": "已锁定 ACG 文化领域，塔迪斯坐标校准完毕，准备跃迁。",
  "action": {
    "type": "TELEPORT",
    "targetType": "star",
    "targetId": "acg"
  }
}


3. 前端执行机制 (Action Handler)

当 3d_garden_prototype.html 中的 JS 收到上述 JSON 时：

先把 message 打印到聊天框中。

识别到 action.type === 'TELEPORT'。

前端脚本根据 targetId: "acg" 遍历 3D 场景中的对象，找到对应的恒星。

触发 GSAP 动画，调用之前写好的 focusOnStar(targetMesh) 函数，摄像机光速飞向 ACG 恒星。

四、 同步机制 (Git -> DB)

由于你是极客，我们肯定不想在网页后台手动录入文章。标准的工作流如下：

本地写作：你在 VS Code 里写 Markdown，放在 src/content/planets/garden_log/day4.md。

Git Push：你将代码推送到 GitHub。

CI/CD 触发 (GitHub Actions)：

脚本读取这篇 Markdown。

解析 Frontmatter，将其信息 Upsert (更新/插入) 到 Supabase 的 nodes 表。

自动向量化：调用 Embedding API，把文章切块，存入 node_embeddings 表。

重新计算所在恒星和行星的 node_count。

五、 MVP（最小可行性产品）边界定义

为了快速跑通这个大型框架，我们把首个 MVP 限定在以下边界：

✅ 包含：

前端 3D 星系枢纽页（带平滑跃迁交互）。

至少一个 2D 沉浸式子页面（如 Markdown 阅读页）。

Supabase 数据库建表完毕，并录入 2-3 个假数据（恒星、行星）验证逻辑。

左下角聊天终端打通 Gemini API。

核心爽点跑通：大模型能成功返回 TELEPORT 指令，且前端能据此产生视角的物理飞跃。

❌ 暂时延后（MVP 之后再做）：

GitHub Action 自动向量化同步脚本（初期我们可以在 Supabase 后台手动建几条测试数据）。

极其复杂的 RAG 对话逻辑（MVP 只要求大模型能“聊天”和“控制 UI跳转”即可）。

复杂的 3D 画廊页面内容填充。