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
  └─ 同源安全 Cookie
          │
Cloudflare Worker
  ├─ 静态资源与 SPA 路由
  ├─ GitHub OAuth + PKCE
  ├─ 玩家档案与会话 API
  └─ 确定性案件规则
          │
Cloudflare D1
  └─ 用户、OAuth 绑定、会话与玩家档案
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
| Cloudflare Workers | 托管前端、API、OAuth 回调、玩家档案和案件裁定。 |
| Cloudflare D1 | 保存账号、会话、云端档案、经济与调查进度。 |
| GitHub OAuth | 玩家登录；使用 PKCE、state 校验和已验证邮箱。 |
| HttpOnly Secure Cookie | 维持 30 天登录会话，浏览器脚本无法读取令牌。 |
| 确定性规则引擎 | 处理决策选项、审讯、线索连线和结构化报告评分。 |
| Wrangler | D1 迁移、本地 Worker 调试、秘密管理和正式部署。 |

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
npm run cloudflare:check
```

## 部署到 Cloudflare

当前生产环境由一个 Cloudflare Worker 同源提供页面和 API，避免跨域 Cookie 与回调问题。

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
2. 执行 `npm run cloudflare:d1:remote` 创建数据库表。
3. 在 GitHub OAuth App 中配置：

```text
Homepage URL: https://<你的 Worker 地址>/
Callback URL: https://<你的 Worker 地址>/api/auth/github/callback
```

4. 将 Client ID 配置为 Worker 普通变量；将 Client Secret 仅写入 Cloudflare Secret：

```bash
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
```

5. 运行 `npm run cloudflare:deploy`，再访问 `/api/cloudflare/status` 和 `/api/auth/config` 检查服务。

新数据库从空档案开始，不会自动导入旧平台或旧 Cloudflare 账号中的玩家。

## 安全设计

- GitHub Client Secret 只保存在 Cloudflare Secret，绝不进入前端、Git 或 `VITE_` 变量。
- 案件真相、真实事实贴近度和正确报告答案不进入浏览器构建产物。
- 玩家档案使用字段白名单、档案版本和活跃设备会话校验。
- OAuth 使用 PKCE、随机 state、严格回调地址和安全 Cookie。
- 规则与档案接口均要求有效登录；未知 API 路由不会代理到旧后端。
- 项目不依赖 Base44，也不调用 `InvokeLLM` 或其他生成式 AI 模型。

## 主要目录

```text
cloudflare/worker/          Worker 路由、GitHub OAuth、会话和档案 API
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
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
- [Vite](https://vite.dev/)
