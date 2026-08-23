# 🕵️‍♂️ Terminal_Detective：逻辑架构师 (Terminal Detective: Logic Architect)

> [cite_start]颠覆传统的“幕后架构师”体验：你不再是拿着放大镜找线索的侦探，而是教 AI 如何探案的“逻辑架构师” 。

## 📖 项目简介

[cite_start]《Terminal_Detective》是一款基于大语言模型（LLM）驱动的高级网页端侦探游戏。游戏打破了传统侦探游戏“系统引导 vs 玩家脑补”的痛点 [cite: 1][cite_start]。玩家的核心任务是构建侦探型 Agent，专注于设计一套能让 LLM 顺利完成任务的智能体循环逻辑（Agentic Loop） 。

[cite_start]你将为 AI 设定“做事套路”，将其投放至错综复杂的案件剧本中，旁观它与 NPC 的交锋，并通过复盘和纠错不断完善 AI 的探案战术，直到完美锁定真凶 。

## ✨ 核心特性

### 🧠 智能体与逻辑架构
* [cite_start]**ReAct 行为框架驱动器**：提供基于 ReAct 框架的基准智能体，动态展现 Agent “观察 -> 思考 -> 行动”的完整推理路径 。
* [cite_start]**多智能体协同**：支持构建多个独立决策的 Agent 或群体 Agent，通过前端数据流转动画展现集体智慧的破案过程 。
* [cite_start]**涌现式叙事引擎**：具备蝴蝶效应模拟与容错机制。若 Agent 逻辑存在漏洞导致指控错误，案件剧情仍将以戏剧性的分支继续发展 。

### 🕵️ 深度案件挑战
* [cite_start]**底层案件库**：首发内置 3 个独立且深度的案件关卡，通过 JSON 静态化管理 。
* [cite_start]**不完全信息博弈**：系统动态释放加分线索与隐藏信息，考验 Agent 在迷雾重重的环境下的判断力 [cite: 1, 2]。
* [cite_start]**鲁棒性试炼**：案件充满信息不对称与逻辑陷阱，界面实时反馈 Agent 受到干扰时的“逻辑混乱度” [cite: 2]。

### 🎨 次世代视效体验
[cite_start]摒弃纯文本，打造极致精美的沉浸式动效 ：
* [cite_start]**探员集结大厅**：全息投影风格配置面板与流光溢彩的属性滑动条 [cite: 2]。
* [cite_start]**沉浸式搜证剧场**：动态打字机交互特效、物理抛物线抓取动效及随剧情变色的氛围渲染 [cite: 2]。
* [cite_start]**粒子化线索图谱**：3D 悬浮软木板，成功建立逻辑关联时触发激光连线与碰撞动效 [cite: 2]。
* [cite_start]**AI 思考具象化**：API 调用期间展示数据流转、代码雨等高质量 CSS 动画 [cite: 2]。

## 🛠️ 技术栈与架构 (The Front-End Trinity)

[cite_start]本项目采用物理隔离的前端工业级架构 ：
* [cite_start]**HTML (纯骨架)**：仅定义界面的 DOM 结构与绝对层级 。
* [cite_start]**CSS (纯皮肤与动画)**：全权负责霓虹光晕、材质渲染、3D 空间变换及关键帧动画 。
* [cite_start]**JavaScript (纯肌肉与大脑)**：统管 ReAct 逻辑、多智能体数据流、LLM API 异步通讯及动态 DOM 更新 。
* [cite_start]**LLM 接口**：接入 Gemini API (通过 4sapi 代理调用) 。

## 🚀 快速开始

### 前置要求
* 现代浏览器 (推荐 Chrome 或 Edge)
* 获取有效的 Gemini API Key 

### 运行步骤
1. 克隆本项目到本地：
   ```bash
   git clone [https://github.com/YourUsername/Terminal_Detective.git](https://github.com/YourUsername/Terminal_Detective.git)
