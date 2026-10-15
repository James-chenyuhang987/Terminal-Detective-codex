# 叙事与技能界面验证（2026-10-15）

- 两案：霓虹血迹、幽灵协议；各生成 opening、pursuit、convergence、closed 四种开发者预置状态。
- 全部状态使用 `createRun`、`applyRunCommand` 和 `publicRun` 生成。核验与结案经过实际本地权威规则；区域位置预置、危机推迟、高阶技能配置，故不代表完整路线实玩或盲测。
- 浏览器夹具只接收 `publicRun`、公开区域与 NPC 基础字段、已取得证据。私有内容规格、后续证词和报告答案保留在 Node 端。
- 真实 `InvestigationFieldPanel` 与 `CaseReconstruction` 共完成 16 次中英 React SSR，验证故事阶段、15 项技能投影、结案事件回顾、已知证据范围和渲染期间不执行调查命令。
- 独立本地端口 `127.0.0.1:5208` 的入口、客户端转译和公开快照均返回 HTTP 200。验收服务已停止；未改变原 `5177` 服务，未连接生产。
- 本轮 Mac 锁屏，未完成桌面/390px 视觉、键盘展开、真实横向溢出和截图验收。这些项目不能由 SSR 或静态 CSS 检查替代。

结果记录：[design-ui-ssr-20261015.json](design-ui-ssr-20261015.json)。临时可重启夹具位于 `/tmp/td-design-qa`，该目录不属于发布构建。
