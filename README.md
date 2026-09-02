# Terminal Detective · Logic Architect

一款中英双语的赛博朋克战术侦探游戏。玩家既是侦探，也是探员队伍的指挥者：组建小队、选择行动、审讯嫌疑人、连接证据，最终提交结构化报告还原真相。

**在线体验：** [terminal-detective-codex.terminal-detective.workers.dev](https://terminal-detective-codex.terminal-detective.workers.dev/)

## 核心玩法

```text
购买与编组探员 → 选择案件 → 回合调查 → 审讯与证据连线
       ↑                                      ↓
       └──── 奖励、升级、科技与装备 ← 结案报告 ┘
```

1. **编组探员**：从探员市场招募支援或高级核心探员，配置主探员、技能、行动顺序、指挥学说和应急预案。
2. **调查案件**：八个案件拥有独立场景、人物、线索图谱和真相；玩家在每回合选择执行探员与行动方案。
3. **判断选项**：探员能力决定选项质量、行动效果，以及“事实贴近度”估算的准确性；高评分是探员预测，不是系统直接公布的答案。
4. **指挥行动**：使用指挥点发动联合行动、战术预演或紧急稳态；关键回合会播放可跳过的轻量 3D 情节演示。
5. **推理取证**：通过选项式审讯发现矛盾，将已取得的线索连接成证据链；NOVA 助理只根据公开信息提供非剧透提示。
6. **提交报告**：选择核心结论、作案方式、动机、时间线和支持证据，由服务端规则给出 S–D 评级。
7. **持续成长**：案件奖励会推进侦探等级、探员经验、等级之路、成就、科技、仓库和货币系统。

## 主要游戏规则

| 系统 | 规则摘要 |
| --- | --- |
| 案件与体力 | 当前共 8 个案件；`NORMAL / HARD / OMEGA` 开始调查分别消耗 10 / 15 / 20 体力。 |
| 回合资源 | 行动消耗 AP；错误判断、陷阱和高压审讯会增加混乱；混乱过高会提高调查风险。 |
| 探员能力 | 观察影响搜索与法证，黑客影响数字入侵，逻辑与抗干扰影响审讯、证据对峙和事实判断。 |
| 指挥系统 | 指挥点只在当前案件生效，可用于联合行动、战术预演和紧急稳态，不属于永久货币。 |
| 线索安全 | 浏览器只接收已经公开的线索；隐藏线索、真实相关度和案件答案只存在于服务端规则中。 |
| 审讯 | 先选择执行探员，再从三个问题中选择一个；新证据会解锁矛盾追问与证据对峙。 |
| 结案评级 | `C` 级及以上视为结案成功；`D` 级表示核心结论错误，但仍会获得有限的过程经验。 |
| 奖励防重 | 每个 `run_id` 只结算一次，避免刷新、重试或重复提交带来重复货币与经验。 |

常规调查不调用生成式 AI。探员思考、行动叙述和 NOVA 提示由本地双语表达库即时生成；敏感裁定由 Cloudflare Worker 中的确定性规则完成，因此不消耗模型积分。

## 技术架构

```text
浏览器
  ├─ React 游戏界面与本地表达引擎
  ├─ Firebase 邮箱密码 / GitHub 登录
  └─ Firebase 短期 ID Token
          │ Authorization: Bearer
Cloudflare Worker
  ├─ 静态资源与 SPA 路由
  ├─ Firebase Token 签名与邮箱验证校验
  ├─ 玩家档案与设备会话 API
  └─ 确定性案件规则
          │
Cloudflare D1
  └─ Firebase UID、玩家档案与调查进度
```

### 前端核心技术

| 技术 | 用途 |
| --- | --- |
| React 18 | 游戏界面、状态交互、抽屉与调查终端。 |
| Vite 6 | 本地开发、生产构建、懒加载和 Cloudflare 静态资源输出。 |
| Tailwind CSS + 自定义 CSS | 响应式布局、赛博朋克视觉、动效与移动端适配。 |
| Three.js + React Three Fiber + Drei | 按需加载的调查回合 3D 情节演示。 |
| 本地 Narrative Engine | 确定性生成双语战术思考、行动演出和提示，不请求模型。 |

### 后端核心技术

| 技术 | 用途 |
| --- | --- |
| Cloudflare Workers | 托管前端、API、Firebase Token 校验、玩家档案和案件裁定。 |
| Cloudflare D1 | 以 Firebase UID 保存云端档案、经济与调查进度。 |
| Firebase Authentication | 统一处理邮箱密码、邮箱验证、密码重置和 GitHub 登录。 |
| Firebase ID Token | 浏览器向 Worker 发送短期 Bearer Token；Firebase SDK 自动刷新。 |
| 确定性规则引擎 | 处理决策选项、审讯、线索连线和结构化报告评分。 |
| Wrangler | D1 迁移、本地 Worker 调试、秘密管理和正式部署。 |

## 部署框架：前端和后端如何组合

生产环境采用“一个 Cloudflare Worker 地址，同时提供前端页面和后端 API”的同源架构。它不是传统的前端服务器加一台长期运行的 Node.js 服务器，也不需要单独维护 Nginx、开放端口或处理跨域 Cookie。

```text
玩家浏览器
   │
   ├─ GET /、/assets/* ─────────── Cloudflare Static Assets
   │                                └─ Vite 构建后的 React、CSS、图片和 3D 分块
   │
   ├─ Firebase 注册 / 登录 ─────── Firebase Authentication
   │                                └─ 邮箱密码、验证邮件、密码重置、GitHub OAuth
   │
   └─ /api/* + Firebase ID Token ─ Cloudflare Worker
                                    ├─ 校验登录身份和输入
                                    ├─ 执行确定性案件规则
                                    └─ 通过 DB binding 读写 Cloudflare D1
```

### 前端是怎么部署的

1. 前端源码位于 `src/`，入口由 React 渲染游戏页面。
2. `npm run build:cloudflare` 使用 Vite 将 React、CSS、公开案件资料和本地表达库编译到 `dist/`。
3. Vite 为资源文件生成内容哈希，更新后的文件使用新地址，未变化的文件可以继续利用 Cloudflare 缓存。
4. 3D 过场使用动态导入，单独生成懒加载分块，不进入首页首屏代码。
5. `wrangler.jsonc` 将 `dist/` 声明为 Worker Static Assets。普通页面请求直接返回静态资源；不存在的前端路由回退到 SPA 首页。

前端可以看到公开 Firebase Web 配置，但看不到 GitHub Client Secret、Firebase 私钥、案件答案或其他服务端秘密。

### 后端是怎么部署的

1. Worker 入口是 `cloudflare/worker/index.js`，所有 `/api/*` 请求都会优先进入这里。
2. `cloudflare/worker/auth.js` 使用 Firebase 公钥验证浏览器提交的 ID Token，确认签名、项目、有效期、UID 和邮箱验证状态。
3. `cloudflare/worker/profile.js` 处理玩家档案；数据库目标只能来自已验证 Token 的 Firebase UID，客户端不能指定另一个玩家。
4. `server/detectiveRules/` 保存案件秘密和确定性裁定规则，由 Wrangler 打包进 Worker，不会进入浏览器的 `dist/`。
5. Worker 通过名为 `DB` 的 binding 访问 Cloudflare D1。D1 保存玩家档案、货币、探员和调查进度。
6. 未命中的 `/api/*` 请求直接返回 404，不会回退到静态页面或旧后端。

Firebase 在这套架构中只负责身份认证，不保存游戏档案；Cloudflare Worker 是游戏 API 后端，Cloudflare D1 是游戏数据库。

### 一次发布会产生什么

| 来源 | 构建结果 | 运行位置 |
| --- | --- | --- |
| `src/`、`public/` | `dist/` 静态文件 | Cloudflare Static Assets/CDN |
| `cloudflare/worker/` | Worker 服务代码 | Cloudflare Workers Runtime |
| `server/detectiveRules/` | 合并进 Worker 的规则代码 | Cloudflare Workers Runtime |
| `cloudflare/migrations/` | D1 表结构变更脚本 | 只有显式执行 migration 才会进入 D1 |
| Firebase 控制台配置 | 登录方式和 OAuth Provider | Firebase Authentication |

`npm run cloudflare:deploy` 会先构建前端，再打包 Worker，最后发布二者。它不会自动执行 D1 migration，也不会自动修改 Firebase 或 GitHub OAuth 设置。

### 请求与数据流

```text
登录：浏览器 → Firebase → ID Token → 浏览器

读取档案：浏览器 → Authorization: Bearer <ID Token>
                    → Worker 验证身份 → D1 查询当前 UID → 返回档案

提交行动：浏览器 → Worker 验证身份与输入
                  → 服务端确定性规则裁定 → 返回公开结果
                  → 浏览器本地表达库生成演出文字
```

采用同源部署后，正式入口应使用 Worker 域名。GitHub Pages 可以作为纯前端备用镜像，但它本身不能运行 Worker API 或访问 D1；若从 GitHub Pages 打开游戏，必须显式把 `VITE_API_SERVER_URL` 指向 Worker，并额外处理跨域策略。

## 内容库的存储与部署

项目将可公开内容、服务端秘密和玩家数据分开保存。它们虽然位于同一仓库中，但不会被部署到同一个运行位置。

| 内容库 | 仓库中的来源 | 生产环境中的存储位置 | 更新方式 |
| --- | --- | --- | --- |
| 双语表达库 | `src/game/narrativeEngine.js`、`src/game/caseNarrativeLibrary.js` | 通用行动句式与八案专属开场、阶段推进、区域氛围分开维护；经 Vite 编译为带内容哈希的浏览器 JS，存放在 Worker Static Assets 中 | 修改语料并通过测试后执行 `npm run cloudflare:deploy` |
| 公开案件资料库 | `src/game/caseData.js`、`caseDataExtra.js`、`caseDataExpansion.js` | 编译到前端静态资源；只包含可向玩家公开的场景、人物、区域和线索描述 | 新增或修改案件后重新构建并部署 Worker |
| 服务端案件秘密库 | `server/detectiveRules/caseSecrets.js` | 由 Wrangler 打包进 Cloudflare Worker 代码，不进入 `dist`，浏览器无法直接下载 | 修改后执行安全测试和 `npm run cloudflare:deploy` |
| 确定性裁定规则库 | `server/detectiveRules/rules.js` | 与 Worker API 一起部署，在服务端处理决策、审讯、连线和报告评分 | 修改规则后重新部署 Worker，不需要重建 D1 表结构 |
| 玩家档案与设备会话 | `cloudflare/migrations/` 定义表结构 | Cloudflare D1 数据库 `terminal-detective-prod`，账号主键为 Firebase UID | 仅在表结构变化时执行 D1 migration；普通代码部署不会清空玩家数据 |
| 图片与 3D 道具库 | `public/assets/` | 构建后进入 `dist/assets/`，由 Worker Static Assets/CDN 分发 | 添加素材、登记许可并重新部署；运行时不依赖外部素材 CDN |
| 第三方程序库 | `package.json`、`package-lock.json` | 前端依赖进入按需 JS 分块；Worker 依赖进入 Worker bundle | 使用 `npm ci` 锁定版本，升级依赖后重新测试和部署 |

### 部署边界

```text
src/game/caseData*.js ──────┐
src/game/narrativeEngine.js ├─ Vite build ─ dist/ ─ Worker Static Assets
src/game/caseNarrativeLibrary.js ┤
public/assets/ ─────────────┘

server/detectiveRules/ ─ Wrangler bundle ─ Cloudflare Worker API

cloudflare/migrations/ ─ 显式执行 migration ─ Cloudflare D1
```

- 表达库在浏览器本地运行，负责呈现气氛、探员思考和行动叙述，因此其中只能使用玩家已经可以知道的信息。
- 案件答案、真实事实贴近度、正确报告选项和 NPC 深层秘密只能放在 `server/detectiveRules/`，禁止从 `src/` 或 `public/` 导入。
- D1 保存会变化的账号、进度、货币和档案；这些数据不会写进静态文件，也不会因为发布新版前端或规则库而被覆盖。
- GitHub Client Secret 等凭据不属于内容库，只能保存在 Firebase Authentication Provider 配置中，不能写进仓库或任何 `VITE_` 变量。

### 内容更新流程

只修改语料、公开案件内容、规则或素材时：

```bash
npm test
npm run typecheck
npm run lint
npm run security:check
npm run cloudflare:check
npm run cloudflare:deploy
```

Vite 会为更新后的静态文件生成新的哈希文件名，Cloudflare 会分发新版本；未变化的资源仍可继续使用缓存。

只有新增字段、数据表或索引时，才需要先应用 D1 migration：

```bash
npm run cloudflare:d1:remote
npm run cloudflare:deploy
```

部署 Worker 不会自动执行数据库迁移；执行数据库迁移也不会自动发布前端和规则代码。开发者需要根据本次改动分别执行，避免误改生产数据。

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

需要同时调试 Worker、D1 和 API 时：

```bash
npm run cloudflare:d1:local
npm run cloudflare:dev
```

提交或部署前建议执行：

```bash
npm test
npm run typecheck
npm run lint
npm run security:check
npm run cloudflare:check
```

## 部署到 Cloudflare

当前生产环境由一个 Cloudflare Worker 同源提供页面和 API；Firebase Authentication 负责邮箱密码、邮箱验证、密码重置和 GitHub 身份，Cloudflare D1 保存游戏进度。

### 已配置账号

```bash
npm run cloudflare:deploy
```

该命令会完成 Cloudflare 专用构建并通过 Wrangler 发布 Worker。

### 首次部署到新账号

```bash
npx wrangler logout
npx wrangler login
npx wrangler whoami
npx wrangler d1 create terminal-detective-prod
```

然后：

1. 将新 D1 的 `database_id` 写入 `wrangler.jsonc`。
2. 在 Firebase 新建 Web App，开启 Email/Password 和 GitHub Provider，启用“一邮箱一账号”与邮箱枚举保护，并把公开 Web 配置写入生产构建使用的 `.env.production.local` 或等价构建环境中的四个 `VITE_FIREBASE_*` 变量。
3. 在只属于本游戏的 GitHub OAuth App 中配置：

```text
Homepage URL: https://<你的 Worker 地址>/
Callback URL: https://<FIREBASE_PROJECT_ID>.firebaseapp.com/__/auth/handler
```

4. 将 GitHub Client ID 与 Client Secret 只填写到 Firebase Authentication 的 GitHub Provider，不写入仓库或 Cloudflare 前端变量。
5. 在 Firebase Authorized domains 添加 Worker 域名、`localhost` 和 `127.0.0.1`；将验证邮件与重置邮件的继续地址设为 Worker 首页。
6. 将 Firebase Project ID 写入 `wrangler.jsonc` 的 `FIREBASE_PROJECT_ID`，它必须与前端项目一致。
7. 审核 D1 目标后再执行迁移。`0002_reset_for_firebase.sql` 会按已确认的方案清空旧用户、旧 OAuth 会话和旧档案：

```bash
npm run cloudflare:d1:remote
```

8. 运行 `npm run cloudflare:deploy`，再访问 `/api/cloudflare/status` 和 `/api/auth/config` 检查服务。

新数据库从空档案开始，不会自动导入旧平台或旧 Cloudflare 账号中的玩家。

## 安全设计

- GitHub Client Secret 只保存在 Firebase Provider 配置中；Firebase 服务账号私钥不进入前端、Cloudflare Worker 或仓库。
- Worker 验证 Firebase RS256 ID Token 的签名、`kid`、`aud`、`iss`、有效期、UID 与邮箱验证状态，并缓存 Google 公钥。
- 案件真相、真实事实贴近度和正确报告答案不进入浏览器构建产物。
- 玩家档案使用字段白名单、嵌套结构限制、档案版本和活跃设备会话校验；读写目标只能来自已验证 Token 的 Firebase UID。
- GitHub 优先使用 Firebase 弹窗授权，受限浏览器自动降级到 Firebase redirect；游戏页面不再承担 OAuth callback。
- 规则与档案接口均要求有效 Firebase Bearer Token；规则接口拒绝客户端身份字段、原型污染键和异常深层数据；401 只强制刷新并重试一次，未知 API 路由不会代理到旧后端。
- 项目默认忽略 `.mcp.json`、`.claude/`、`.cursor/`、私钥和本地环境文件；需要引入项目级自动执行配置时必须先人工审核。
- 依赖版本使用精确锁定，`.npmrc` 固定官方 npm registry；`npm run security:check` 会检查隐藏执行配置、常见密钥痕迹和锁文件下载域名。
- 项目不依赖 Base44，也不调用 `InvokeLLM` 或其他生成式 AI 模型。

## 主要目录

```text
cloudflare/worker/          Worker 路由、Firebase Token 校验和档案 API
cloudflare/migrations/      D1 数据库迁移
server/detectiveRules/      服务端案件秘密与确定性规则
src/components/game/        首页、大厅、调查终端、结算和功能模块
src/game/                   游戏状态、经济、探员、案件与表达引擎
src/api/cloudflareClient.js 浏览器端同源 API 客户端
public/assets/              首页、3D 道具与其他本地资源
tests/                      规则、档案、界面行为和安全测试
```

## 官方文档

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [Firebase Authentication](https://firebase.google.com/docs/auth/web/start)
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
- [Vite](https://vite.dev/)

## 生产服务器、登录风险与存档保障

### 本项目实际使用的服务器

本项目没有传统 VPS，也不依赖腾讯云、Base44 或 Supabase。生产环境采用 Cloudflare 无服务器架构：

```text
玩家浏览器
  ├─ 页面、CSS、图片和 3D 资源 ── Cloudflare Static Assets / CDN
  ├─ 邮箱密码与 GitHub 登录 ───── Firebase Authentication
  └─ /api/* + Firebase ID Token ─ Cloudflare Worker
                                  ├─ 验证身份和输入
                                  ├─ 执行确定性案件规则
                                  └─ 通过 DB binding 读写 Cloudflare D1
```

- Cloudflare Static Assets 负责分发 Vite 构建后的 React 前端。
- Cloudflare Worker 是游戏后端，处理 `/api/*`、身份校验和规则结算。
- Cloudflare D1 是玩家数据数据库，保存档案、货币、探员和案件进度。
- Firebase Authentication 只负责身份认证，不保存游戏进度。
- GitHub 只作为 Firebase 的一种登录凭据，不直接读写 D1。

### 免费额度与并发判断

10 名玩家同时登录或游玩通常不会形成性能压力。需要关注的是每天累计请求和邮件数量，而不是十人的瞬时并发。

- Cloudflare Workers Free 当前提供每天 100,000 次 Worker 请求；普通静态资源请求不计入该额度。
- `/api/*` 会执行 Worker，因此登录初始化、读取档案和保存进度都会计入 Worker 请求。
- Worker 免费请求耗尽时，API 可能返回 `429` 或 Cloudflare `1027`；这不是 `404limited`。
- Firebase Spark 方案启用 Identity Platform 后当前约支持每天 3,000 名活跃用户。
- Firebase 免费方案当前约提供每天 1,000 封邮箱验证邮件和 150 封密码重置邮件；官方可能调整额度。
- 同一 IP 大量注册、反复发送邮件或异常访问仍可能触发 Firebase 的滥用保护和临时限流。

正式运营前应以官方最新页面为准：

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Static Assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Firebase Authentication limits](https://firebase.google.com/docs/auth/limits)
- [Firebase pricing](https://firebase.google.com/pricing)

### 登录问题的实际边界

项目已尽量把认证故障转换为可以恢复的用户流程，但任何外部认证和网络服务都无法承诺永远不出错。

| 场景 | 当前保护 | 仍可能发生的情况 |
| --- | --- | --- |
| 邮件繁忙或限流 | 正常发送后冷却 60 秒；真正命中限流后按 2、4、8 分钟逐级退避，最高 15 分钟；验证等待页可改用 GitHub | 达到 Firebase 日额度、同 IP 请求过多或触发滥用保护时，邮件仍可能延迟或被限制 |
| OAuth 回调 404 | GitHub 优先使用 Firebase 弹窗；降级回调使用 Firebase 官方 handler；应用启动时会清除遗留的认证错误 query/hash | Firebase Authorized Domains、GitHub Callback URL 或生产域名配置错误时仍会拒绝授权，但界面会给出可恢复提示 |
| 原始 `error` 或空白页 | 已知 Firebase、Worker 和 D1 错误统一映射为中英文提示；顶层故障只展示匿名故障编号，不显示原始异常内容 | 未知代码缺陷、浏览器扩展拦截或第三方服务整体故障仍可能中断当前操作 |
| 登录失败 | 登录前检查前后端 Firebase 项目是否一致、D1 binding 和必要表字段是否就绪；会话初始化每次最多等待 10 秒，对网络及 429/502/503/504 最多重试两次，401 只刷新 Token 一次 | 密码错误、邮箱未验证、授权取消、网络中断、Provider 未开启或真实生产配置缺失时仍会拒绝登录 |
| 玩家数据未保存 | 所有档案写入先进入按 Firebase UID 隔离的本地写前日志，再写 D1；断网、超时、429 和临时 5xx 会保留乐观结果，并在登录、联网和定时轮询时自动重放；D1 继续使用版本校验防止覆盖 | 浏览器禁用/清除本地存储、D1 长期不可用、免费额度耗尽或另一设备主动接管时不能保证立即写入云端；界面会明确显示“待同步”或“只读” |

`404limited` 不是 Firebase 或 Cloudflare 的标准错误名称。认证回调地址错误可能产生 404，限流通常产生 Firebase 限流错误、HTTP `429` 或 Cloudflare `1027`，排查时应分别处理。

### 已实施的恢复链路

```text
打开登录页
  └─ /api/auth/config 就绪检查
       ├─ Firebase 前后端项目不一致 ── 阻止登录并提示管理员修复
       ├─ D1 binding / 表结构未就绪 ─ 阻止登录并提供重试
       └─ 全部就绪 ────────────────── 允许邮箱或 GitHub 登录

档案发生变化
  └─ 先写入浏览器本地恢复日志
       ├─ D1 成功 ───── 清除本地日志，显示“云端已同步”
       ├─ 临时失败 ──── 保留日志，显示“待同步”，自动重试
       └─ 永久非法请求 ─ 清除无效日志并显示可见错误，避免无限重试
```

本地恢复日志保存的是当前玩家档案字段的最终值，而不是可重复累加的操作，因此即使 D1 已写入但浏览器没有收到响应，重放也不会重复发放同一份奖励。每个日志按 Firebase UID 分区，另一个账号登录时不会读取到当前账号的待同步数据。

### 当前配置状态与上线前检查

仓库默认保留安全占位符，不包含真实 Firebase 配置。若 `wrangler.jsonc` 中的 `FIREBASE_PROJECT_ID` 仍是 `REPLACE_WITH_FIREBASE_PROJECT_ID`，或生产构建没有注入四个 `VITE_FIREBASE_*` 变量，Firebase 登录将无法工作。这属于尚未配置，不是并发或服务器性能问题。

正式开放前必须逐项确认：

1. 生产构建已注入真实的 `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID` 和 `VITE_FIREBASE_APP_ID`。
2. Worker 的 `FIREBASE_PROJECT_ID` 与前端 Firebase 项目完全一致。
3. Firebase Authorized Domains 包含当前 Worker 生产域名。
4. Terminal Detective 专用 GitHub OAuth App 的 callback 指向 Firebase 官方 handler，Client Secret 只保存在 Firebase 控制台。
5. Cloudflare Worker 的 `DB` binding 指向正确的生产 D1，并且目标迁移已经人工审核和应用。
6. `/api/cloudflare/status` 与 `/api/auth/config` 在生产环境返回正常状态。
7. 实际完成一次完整冒烟测试：注册 → 验证邮箱 → 登录 → 开始案件 → 产生进度 → 刷新 → 退出 → 重新登录，并确认货币、探员和案件进度均仍存在。
8. 分别测试 GitHub 登录、错误密码、未验证邮箱、密码重置、网络中断和多设备接管。

只有真实生产域名上的完整登录和存档闭环通过后，才能确认线上配置正确。代码中的错误保护可以减少白屏、无限重试和静默丢档，但不能替代 Firebase、GitHub、Worker 和 D1 的生产配置与上线验证。
