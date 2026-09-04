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
| `jose` | 在 Worker 中导入 Google X.509 公钥并验证 Firebase RS256 ID Token。 |
| Wrangler | 构建 Worker、应用 D1 migration、本地调试和正式部署。 |

### 当前版本基线

| 运行层 | 当前版本或基线 |
| --- | --- |
| Node.js | 22+（GitHub Actions 使用 22） |
| React / React DOM | 18.3.1 |
| Firebase Web SDK | 12.18.0 |
| Vite | 8.2.2 |
| TypeScript | 5.9.3（通过 `jsconfig.json` 检查 JavaScript/JSX） |
| Three.js / React Three Fiber / Drei | 0.168.0 / 8.18.0 / 9.122.0 |
| `jose` | 6.2.10 |
| Wrangler | 4.128.0 |
| Workers compatibility date | `2026-08-31`，启用 `nodejs_compat` |

依赖使用精确版本并由 `package-lock.json` 锁定。升级认证、构建或 Worker 依赖时必须重新执行测试、类型检查、生产构建、Worker dry-run 和安全扫描，不能只确认本地开发服务器可以启动。

### 认证与会话状态机

1. 邮箱注册要求 8–64 个字符、至少一个字母和一个数字；注册后必须完成 Firebase 邮箱验证，未验证用户不会初始化 D1 档案。
2. 验证邮件和密码重置使用 Firebase 官方处理页，返回地址是当前应用首页，不使用 Magic Link，也不把认证参数写入游戏 hash 路由。
3. GitHub 登录和绑定优先使用 popup；浏览器阻止弹窗或不兼容时才切换 Firebase redirect。应用启动时只清除旧 OAuth 遗留的错误 query/hash，不破坏游戏路由。
4. Firebase 使用“一邮箱一账号”。同邮箱凭据冲突时先使用已有方式登录，再在设置中绑定 GitHub 或密码；禁止解绑最后一种可用凭据。
5. 绑定、解绑、添加密码和修改密码要求最近 5 分钟内完成过登录；过期时通过当前密码或 GitHub 重新认证。
6. 邮件、注册、邮箱登录和 GitHub 操作分别记录冷却。成功发送后冷却 60 秒；真实限流按 2、4、8、15 分钟退避并持久化到 `localStorage`。
7. 登录完成后，前端在一个 10 秒总 deadline 内获取 ID Token 并初始化 Worker 会话。网络、`408/429/502/503/504` 最多额外重试两次；`401` 只强制刷新 Token 并重试一次。

Worker 不接受客户端提交的 UID。它从 ID Token 读取用户身份，并验证 RS256 签名、Google 公钥 `kid`、`aud`、`iss`、`exp`、`iat`、`auth_time`、非空 UID、邮箱和 `email_verified`。Google 公钥按响应 `Cache-Control` 缓存；并发刷新会合并，未知 `kid` 与下载失败有独立短退避，避免外部故障放大。

认证 Context 的主要接口位于 `src/lib/AuthContext.jsx`：

```js
{
  user,
  isAuthenticated,
  isLoadingAuth,
  authChecked,
  authBackend,
  signInWithEmail,
  signUpWithEmail,
  sendVerificationAgain,
  refreshEmailVerification,
  sendPasswordReset,
  loginWithGitHub,
  linkGitHub,
  unlinkGitHub,
  addPassword,
  changePassword,
  logout,
  getIdToken
}
```

### 档案一致性与离线恢复

档案保存不是简单的“最后一次整份覆盖”，而是浏览器 WAL、D1 revision CAS 和服务端幂等账本三层协作：

| 层 | 机制 |
| --- | --- |
| 浏览器 WAL v2 | 每个 Firebase UID、operation ID 保存一个独立 `localStorage` 记录；包含 lineage、patch、base revision、时间、尝试次数和 checksum。 |
| 顺序重放 | 同一 lineage 按持久化顺序提交；只有前一项明确提交为 `base + 1` 时才推进后一项 revision。重放期间阻止新的档案 mutation 插入固定快照。 |
| 标签页隔离 | 新标签页可以重放旧 lineage，但旧 lineage 排空前不能创建新 mutation；检测到多个 lineage 分叉时停止自动写入，避免静默覆盖。 |
| D1 CAS | `profiles.profile_revision` 与 `active_session_id` 同时参与条件更新；保存过程中被另一设备接管会返回 `SESSION_TAKEN`。 |
| 幂等账本 | `profile_operations` 以 `(user_id, operation_id)` 为主键并记录 patch SHA-256、base/result revision；重试不会重复结算。 |
| 输入边界 | `expected_revision` 必须是非负安全整数，patch 不能为空；单次 patch 和合并后的完整档案均不得超过 512 KiB。 |
| 案件结算 outbox | 结算意图按 UID 与 `run_id` 独立保存，只有对应 WAL 真正提交后才删除，便于版本冲突后重新应用。 |

真正的跨设备 `STALE_PROFILE` 不会自动把绝对值 patch 重基到新档案，因为这可能覆盖另一设备的货币、购买或奖励。此类冲突会进入显式恢复；断网、超时、`429` 和临时 `5xx` 则保留乐观状态，并在登录、恢复联网和每 20 秒轮询时自动重放。

| 同步状态 | 行为 |
| --- | --- |
| `online` | 云端已同步，可正常修改。 |
| `syncing` | 正在按顺序重放，暂时阻止新 mutation。 |
| `pending` | 临时故障，WAL 保留并等待自动重试。 |
| `readonly` | 账号已被另一设备接管；当前设备保留未同步操作但停止写云端。 |
| `storage_unavailable` | 浏览器本地持久化不可用，为防止丢档停止修改。 |
| `recovery` | WAL 损坏、lineage 分叉或真实版本冲突，停止自动写入；可恢复的结算意图会保留，其余待同步 patch 需要玩家确认后舍弃。 |

`localStorage` WAL 只能防御暂时断网、刷新和短期服务故障。玩家主动清除站点数据、浏览器禁用存储、磁盘故障或 D1 长期不可用时，仍不能承诺本地待同步操作永久存在。

### Worker API 契约

| 路径 | 认证 | 用途 |
| --- | --- | --- |
| `GET /api/auth/config` | 无 | 返回 Firebase、D1 binding 和必要 schema 的 readiness。 |
| `GET /api/cloudflare/status` | 无 | 聚合服务状态；未就绪时返回 `503`。 |
| `GET /api/auth/session` | Firebase ID Token | 返回统一的 `firebase-cloudflare` 账户结构。 |
| `GET /api/apps/:appId/entities/User/me` | Firebase ID Token | 读取当前 Token UID 对应的账户和档案。 |
| `POST /api/apps/:appId/functions/playerProfile` | Firebase ID Token | `claim_session`、`status` 和幂等 `patch`；档案 owner 只取自服务端验证后的 Token UID。 |
| `POST /api/apps/:appId/functions/detectiveRules` | Firebase ID Token | 执行白名单内的确定性案件规则。 |

所有 `/api/*` 未知路径直接返回 JSON 404，不会回退到 SPA。未知服务端故障只向玩家返回匿名 `TD-XXXXXXXXXX` 故障编号；原始异常只写入 Worker 日志。

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

`npm run cloudflare:deploy` 会依次运行完整测试、类型检查、Lint、秘密扫描、`release:check`、Cloudflare 生产构建和 Wrangler dry-run；全部通过后才发布前端 Static Assets 与 Worker。`release:check` 会确认前端四个 Firebase Web 值、Worker Firebase Project ID、D1 database ID、APP ID 与 CORS origins 完整且相互一致。页面中的 `td-build` 默认记录当前 Git 提交；从未提交工作树构建时追加 `-dirty`，Actions 则固定使用发布提交的完整 SHA。部署不会自动执行 D1 migration，也不会自动修改 Firebase 或 GitHub OAuth 设置。

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

行动叙事为十二种合法调查行动各维护至少五组中英文语义配对场景，并按开场、追索、升级、收束四个阶段追加案件节奏；模板选择由案件、回合和行动种子确定，不读取服务端秘密。3D 行动演出为每种行动提供两套程序化几何、镜头和运动组合，共二十四套确定性变体；变体按事件 ID 选择，继续遵守画质设置、减少动态效果、数据节省、WebGL 检测和 2D 降级策略。

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
5. 在 Firebase Authorized domains 添加 Worker 域名、`localhost` 和 `127.0.0.1`；将验证邮件与重置邮件的继续地址设为 Worker 首页，并按下方“认证邮件投递”清单配置邮件模板。
6. 将公开的 Firebase Project ID 写入 `wrangler.jsonc` 的 `FIREBASE_PROJECT_ID`，它必须与前端项目一致；运行 `npm run release:check` 确认发布配置。
7. 安排维护窗口并审核 D1 目标后再执行迁移。`0002_reset_for_firebase.sql` 会按已确认的方案清空旧用户、旧 OAuth 会话和旧档案；`0003_profile_operations.sql` 创建档案幂等操作账本：

```bash
npm run cloudflare:d1:remote
```

8. 迁移成功后立即运行 `npm run cloudflare:deploy`，再访问 `/api/cloudflare/status` 和 `/api/auth/config` 检查服务。当前生产 D1 已应用 `0001`–`0003`，包含 `profile_operations` 幂等账本；不要在迁移完成而新 Worker 尚未发布时重新开放游戏。

新数据库从空档案开始，不会自动导入旧平台或旧 Cloudflare 账号中的玩家。

如果启用 GitHub Pages 备用前端，还需在仓库 Actions variables 中配置 `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_APP_ID` 和 `VITE_BASE_PATH`，将 Pages 主机名加入 Firebase Authorized Domains，并把 Pages 精确来源加入 Worker 的 `CORS_ALLOWED_ORIGINS`。这些 Firebase Web App 值是公开标识，不得把 GitHub Client Secret 或 Firebase 私钥放入 Actions variables。

### 认证邮件投递

前端会按玩家当前语言请求中文或英文 Firebase 模板，并在验证等待页和密码重置成功提示中显示垃圾邮件恢复步骤。可选的公开变量 `VITE_FIREBASE_EMAIL_SENDER` 只用于向玩家显示可搜索、可加入允许列表的发件地址；它必须与 Firebase Authentication 邮件模板实际配置一致，不会改变真正的发件人。

正式开放前在 Firebase Console 的 Authentication 邮件模板中逐项确认：

1. 验证邮箱和重置密码模板都使用可识别的 `Terminal Detective` 发件人名称、明确的中英文标题与简短正文，说明玩家为何收到邮件。
2. 为中文和英文分别保存模板，检查链接文字、继续地址、支持邮箱和回复地址，避免默认项目名、占位符或测试域名出现在生产邮件中。
3. 使用 Gmail、Outlook/Hotmail、QQ 邮箱和 163 邮箱的真实收件箱各发送一次验证与重置邮件，记录收件、垃圾箱和延迟结果；找到误判邮件后标记“不是垃圾邮件”。
4. 不通过反复点击重发来测试投递。重发仍受客户端冷却、Firebase 配额、同 IP 限流和滥用保护约束。

Firebase 默认认证邮件的共享发件基础设施、发送信誉和收件服务商判定不受本仓库代码控制，因此 UI 提示不能保证邮件永远进入主收件箱。如果持续出现高比例垃圾箱投递，应单独设计服务端邮件链路：由受信任后端生成一次性 Firebase action link，再通过已验证自有域名的事务邮件服务发送，并为该域名正确配置 SPF、DKIM 和 DMARC。该方案需要新的邮件服务商、Worker secrets、滥用防护和投递监控，当前实现不会在未经审核时静默引入它。

## 安全设计

- GitHub Client Secret 只保存在 Firebase Provider 配置中；Firebase 服务账号私钥不进入前端、Cloudflare Worker 或仓库。
- Worker 验证 Firebase RS256 ID Token 的签名、`kid`、`aud`、`iss`、有效期、UID 与邮箱验证状态，并缓存 Google 公钥。
- Token 的 `iat` 与 `auth_time` 必须是合理的正整数时间，`exp` 必须晚于当前时间和 `iat`；时钟偏差容忍上限为 5 分钟。
- 案件真相、真实事实贴近度和正确报告答案不进入浏览器构建产物。
- 玩家档案使用字段白名单、嵌套结构限制、档案版本和活跃设备会话校验；读写目标只能来自已验证 Token 的 Firebase UID。
- 每次档案修改先写入按完整 Firebase UID、operation ID 和 lineage 隔离的 WAL v2 记录，再通过 D1 操作账本和档案版本 CAS 更新；跨标签页分叉会失败关闭，重复请求不会重复结算。
- GitHub 优先使用 Firebase 弹窗授权，受限浏览器自动降级到 Firebase redirect；游戏页面不再承担 OAuth callback。
- 登录前会核对前后端 Firebase Project ID、D1 binding 和必要表字段；`/api/cloudflare/status` 未就绪时返回 `503`，不会伪报成功。
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
src/game/profileWal.js      按 UID/operation/lineage 隔离的浏览器 WAL v2
src/lib/AuthContext.jsx     Firebase 登录、验证、绑定、重认证和 Token 提供器
src/lib/ProfileContext.jsx  档案 claim、乐观状态、顺序重放与冲突恢复
src/lib/authSession.js      10 秒会话 deadline、有限重试和 401 单次刷新
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

### 容量、额度与并发边界

静态资源、Worker API、D1 查询和 Firebase 邮件分别计费或限流，不能用一个“同时在线人数”数字推导整体容量：

- `/api/*` 会执行 Worker，并进一步产生 D1 查询；静态资源是否计入请求额度取决于 Cloudflare 当前套餐规则。
- D1 需要同时关注每日读写行数、单次查询和数据库大小，不能只看 Worker 请求数。
- Firebase 邮箱验证、密码重置、活跃用户和滥用保护的额度会随方案、地区和官方政策变化。
- 同一 IP 高频注册、重复发送邮件或异常 OAuth 请求，即使未达到日额度也可能被临时限制。
- 额度耗尽或滥用保护通常表现为 Firebase 限流错误、HTTP `429` 或 Cloudflare 平台错误；`404limited` 不是标准错误名称。

因此 README 不硬编码可能过期的免费额度。容量评估和正式运营前检查必须以控制台用量及官方最新页面为准：

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Static Assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Firebase Authentication limits](https://firebase.google.com/docs/auth/limits)
- [Firebase pricing](https://firebase.google.com/pricing)

### 登录问题的实际边界

项目已尽量把认证故障转换为可以恢复的用户流程，但任何外部认证和网络服务都无法承诺永远不出错。

| 场景 | 当前保护 | 仍可能发生的情况 |
| --- | --- | --- |
| 邮件进入垃圾箱、繁忙或限流 | 按界面语言请求对应模板；页面显示常用发件地址、垃圾箱/广告分类检查和允许列表步骤；正常发送后冷却 60 秒，真正命中限流后按 2、4、8 分钟逐级退避，最高 15 分钟；验证等待页仍可改用 GitHub | Firebase 默认发送信誉、收件服务商规则、日额度、同 IP 频率和滥用保护不受前端控制，邮件仍可能延迟、误判或被限制 |
| OAuth 回调 404 | GitHub 优先使用 Firebase 弹窗；降级回调使用 Firebase 官方 handler；应用启动时只清除遗留认证错误 query/hash | Firebase Authorized Domains、GitHub Callback URL 或生产域名配置错误时仍会拒绝授权，但界面会提供恢复提示 |
| 原始 `error` 或空白页 | 已知 Firebase、Worker 和 D1 错误统一映射为中英文提示；未知顶层故障只展示匿名故障编号 | 未知代码缺陷、浏览器扩展拦截或第三方服务整体故障仍可能中断当前操作 |
| 登录失败 | 登录前检查前后端 Firebase 项目、D1 binding、必要 migration、主键、邮箱唯一索引和级联外键；Firebase 公钥下载包含响应体读取在内最多等待 3.5 秒，并对网络错误及有限的临时状态重试一次；会话初始化总计最多等待 10 秒，网络及 `429/502/503/504` 最多重试两次，`401` 只刷新 Token 一次 | 密码错误、邮箱未验证、授权取消、网络中断、Provider 未开启或真实生产配置缺失时仍会拒绝登录 |
| 玩家数据未保存 | 所有档案写入先进入按 Firebase UID、operation ID 与 lineage 隔离的 WAL v2，再以 D1 幂等账本和 revision CAS 写入；断网及临时服务故障会保留乐观结果，并在登录、联网和定时轮询时顺序重放 | 浏览器禁用或清除本地存储、D1 长期不可用、免费额度耗尽、真实版本冲突或另一设备接管时不能保证立即写入云端；界面会明确显示“待同步”“只读”或“需要恢复” |

`404limited` 不是 Firebase 或 Cloudflare 的标准错误名称。认证回调地址错误可能产生 404，限流通常产生 Firebase 限流错误、HTTP `429` 或 Cloudflare `1027`，排查时应分别处理。

### 当前配置状态与上线前检查

`wrangler.jsonc` 保存当前生产 Firebase Project ID；它是公开标识，不是密钥。仓库不保存 Firebase API key、GitHub Client Secret 或 Firebase 私钥，生产构建必须从受控构建环境注入四个公开的 `VITE_FIREBASE_*` 值。`npm run release:check` 会在构建和部署前拒绝占位符、缺失值、前后端项目错配、无效 D1 ID 与不安全 CORS origin，避免发布无法登录的静态资源。

正式开放前必须逐项确认：

1. 生产构建已注入真实的 `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID` 和 `VITE_FIREBASE_APP_ID`。
2. Worker 的 `FIREBASE_PROJECT_ID` 与前端 Firebase 项目完全一致。
3. Firebase Authorized Domains 包含当前 Worker 生产域名。
4. Firebase 验证与重置模板已配置中英文版本、可识别发件人和正确继续地址；若设置 `VITE_FIREBASE_EMAIL_SENDER`，它与实际发件地址一致。
5. 已使用至少 Gmail、Outlook/Hotmail、QQ 邮箱和 163 邮箱完成验证与重置邮件的投递抽查。
6. 若启用 GitHub Pages，Actions variables 已提供四个必需的 `VITE_FIREBASE_*` 值，Pages 主机名已加入 Firebase Authorized Domains，Pages 来源已加入 Worker 的 `CORS_ALLOWED_ORIGINS`。
7. Terminal Detective 专用 GitHub OAuth App 的 callback 指向 Firebase 官方 handler，Client Secret 只保存在 Firebase 控制台。
8. Cloudflare Worker 的 `DB` binding 指向正确的生产 D1，并且目标迁移已经人工审核和应用；readiness 已确认 `0003_profile_operations.sql`、必要主键、完整邮箱唯一索引及级联外键。
9. `/api/cloudflare/status` 与 `/api/auth/config` 在生产环境返回正常状态，页面源码中的 `td-build` 与本次发布 Git SHA 一致。
10. 实际完成一次完整冒烟测试：注册 → 验证邮箱 → 登录 → 开始案件 → 产生进度 → 刷新 → 退出 → 重新登录，并确认货币、探员和案件进度均仍存在。
11. 分别测试 GitHub 登录、错误密码、未验证邮箱、密码重置、网络中断和多设备接管。

只有真实生产域名上的完整登录和存档闭环通过后，才能确认线上配置正确。代码中的错误保护可以减少白屏、无限重试和静默丢档，但不能替代 Firebase、GitHub、Worker 和 D1 的生产配置与上线验证。
