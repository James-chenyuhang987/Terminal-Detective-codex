# Terminal Detective · Logic Architect

一款由 LLM 驱动的赛博朋克多智能体侦探游戏。玩家配置探员队伍与调查策略，通过 ReAct 循环推进案件、连接证据并提交最终报告。

## 当前架构

```text
GitHub Pages 前端
  └─ Base44 API / JavaScript SDK
       ├─ playerProfile 云函数（会话、版本与档案白名单）
       └─ detectiveLLM 云函数
            └─ Base44 内置 InvokeLLM
```

- 前端：React 18、Vite 6、Tailwind CSS
- 后端：Base44 托管的 `playerProfile` 与 `detectiveLLM` 云函数
- 模型调用：Base44 内置 `InvokeLLM`
- 身份认证：Base44 邮箱登录、注册和邮箱验证码
- 当前代码不使用 DeepSeek API Key，也不包含第三方模型密钥

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

`.env.example` 中只有公开连接配置，不应在任何 `VITE_` 变量中保存 API Key。Vite 会把 `VITE_` 变量编译进浏览器代码。

常用检查：

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## 部署

项目使用两部分部署。GitHub Pages 只托管静态前端；LLM 云函数仍部署在 Base44，以免服务端能力和模型调用暴露到浏览器。

### 1. 同步 Base44 用户档案结构

首次使用 CLI 时：

```bash
npm install -g base44@latest
base44 login
base44 link
```

在交互步骤中选择此项目对应的 Base44 应用。首页经济、仓库、科技、成就和任务进度依赖 `base44/entities/User.jsonc` 中的新字段。

`base44 entities push` 是实体结构的全量同步。在执行前，先在 Base44 后台确认远端没有仓库中缺失、仍需保留的其他实体；确认无误后再运行：

```bash
base44 entities push
```

不要在未核对远端实体时直接执行，也不要在自动部署流程中静默执行这一步。

### 2. 部署 Base44 认证与后端函数

启用仓库中配置的邮箱密码认证，并部署游戏使用的函数：

```bash
base44 auth push
base44 functions deploy detectiveLLM playerProfile
```

不要随意添加 `--force`；该参数会删除 Base44 上不存在于本地的其他远程函数。

### 3. 部署 GitHub Pages 前端

仓库已经包含 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)。它会在每次推送到 `main` 后自动执行测试、类型检查、Lint、构建和 Pages 部署。

1. 将代码推送到 GitHub：

   ```bash
   git add -A
   git commit -m "准备 GitHub Pages 部署"
   git push
   ```

2. 打开 GitHub 仓库的 **Settings → Pages**。
3. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
4. 在 **Actions** 页面等待 `Deploy frontend to GitHub Pages` 完成。

默认访问地址：

```text
https://James-chenyuhang987.github.io/Terminal-Detective-codex/
```

工作流会自动根据仓库名称生成 Vite 子路径。如果以后改用自定义域名，在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 中创建：

```text
VITE_BASE_PATH=/
```

## 安全说明

- `base44/functions/detectiveLLM/` 保存服务端提示词、案件真相和裁定逻辑。
- `base44/functions/playerProfile/` 只允许写入明确列出的游戏档案字段，并校验设备会话与档案版本。
- 浏览器只提交受限制的游戏状态与 ID，不接收服务端案件秘密。
- LLM 函数要求已认证用户，避免公开匿名调用产生费用。
- `.env`、`.env.local`、构建目录和依赖目录均已被 Git 忽略。

## 相关官方文档

- [Vite：部署静态站点](https://vite.dev/guide/static-deploy)
- [GitHub：自动部署网站](https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically)
- [Base44：外部应用使用 SDK](https://docs.base44.com/developers/references/sdk/getting-started/client)
- [Base44：部署后端函数](https://docs.base44.com/developers/references/cli/commands/functions-deploy)
- [Base44：同步实体结构](https://docs.base44.com/developers/references/cli/commands/entities-push)
