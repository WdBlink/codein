# Codeian Obsidian 插件 - 项目简报

## 1. 目的

本文档用于保存 Codeian Obsidian 插件首个演示版本所需的前置参考资料、设计约束和开发规则。

本项目应以 Obsidian 官方插件开发路径作为主要事实来源：

`obsidian-sample-plugin` -> `Build a plugin` -> 插件指南与自评清单 -> 在独立 vault 中测试 -> GitHub release -> 提交到 `obsidian-releases`。

## 2. 官方参考资料

### Obsidian 开发者文档

链接：<https://docs.obsidian.md/>

官方开发者文档覆盖插件开发、主题、API 使用、提交和发布流程。它也会指向面向开发者的社区支持渠道，包括 Discord 的 `#plugin-dev` 频道，以及 Obsidian 论坛中的 Developers & API 板块。

### Build a Plugin

链接：<https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin>

从零开始创建插件的官方教程。推荐的基础技术栈为：

- TypeScript
- Node.js
- Git

重要规则：不要直接在主力笔记 vault 中开发或测试插件。应使用独立的测试 vault，避免插件 bug 意外修改真实笔记。

### 官方示例插件

链接：<https://github.com/obsidianmd/obsidian-sample-plugin>

官方社区插件模板。新插件通常从这个仓库开始。它包含 Obsidian 插件所需的核心文件和工作流：

- `manifest.json`
- `main.ts`
- 构建配置
- 发布工作流
- ESLint 配置

### 提交插件

链接：<https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin>

将插件发布到社区插件市场的官方提交流程。提交需要：

- GitHub 仓库
- `README.md`
- `LICENSE`
- `manifest.json`
- GitHub release
- 提交到 `obsidianmd/obsidian-releases` 的 pull request

### Obsidian October 插件自评清单

链接：<https://docs.obsidian.md/oo/plugin>

这是一个有用的发布前和设计质量检查清单。它覆盖命名、兼容性、移动端支持、安全性、API 使用、性能、界面文案，以及其他官方审核偏好。

需要牢记的关键规则：

- 没有充分理由时，不要设置默认快捷键。
- 不要硬编码 `.obsidian` 路径。
- 如果预期支持移动端，不要在顶层使用 Node 或 Electron 模块。
- 不要随意添加遥测。
- 优先使用官方 Obsidian API，例如 `Vault`、`FileManager` 和 `Plugin.loadData()`。

### 优化插件加载时间

链接：<https://docs.obsidian.md/plugins/guides/load-time>

Obsidian 插件会影响应用启动速度。应保持 `onload()` 轻量：

- 只在 `onload()` 中注册必要的命令、设置、视图、事件和生命周期钩子。
- 将较重的工作推迟到 `workspace.onLayoutReady()` 之后。
- 避免用网络请求、大文件扫描或昂贵的初始化阻塞启动过程。

## 3. 模板项目参考

参考模板项目：

<https://github.com/YishenTu/claudian>

设计 Codeian 首个演示版本时，可将该项目作为额外的结构和产品参考，但插件行为的最终依据仍应是 Obsidian 官方文档和 API。

## 4. 项目设计目标

### 核心目标

这个 Obsidian 插件的核心功能，是将 CodeX 工具作为基于侧边栏的工具引入 Obsidian。

插件应允许用户在 Obsidian 工作区内访问 CodeX，而不是切换到独立终端或外部应用。

### 开发标准

插件应遵循 Obsidian 官方文档推荐的开发模型和编程语言约定。

基础预期：

- 使用 TypeScript。
- 遵循官方 Obsidian 插件结构。
- 使用 Obsidian 的插件生命周期方法和官方 API。
- 尽可能让插件行为符合 Obsidian 的审核预期。

### 功能参考

上文列出的 GitHub 模板项目可作为主要功能参考。

该模板项目展示了如何将 Claude Code 作为侧边栏工具嵌入 Obsidian。Codeian 应采用相同的总体产品模式：

- 注册一个 Obsidian 侧边栏视图。
- 在该视图中渲染嵌入式编码 agent 界面。
- 让工具可以通过 Obsidian 命令或工作区 UI 访问。
- 将 Obsidian 视为宿主工作区，将编码工具视为嵌入式助手或工具层。

### 首个演示目标

Codeian 的首个演示版本在概念上应接近模板项目，但有一个关键替换：

- 将 Claude Code 替换为用户的 CodeX 工具。

模板项目中的既有核心思路可在合适时复用，包括侧边栏集成、工作区注册、生命周期处理、命令注册和基础 UI 布局。

首个演示版本应优先证明 CodeX 可以从 Obsidian 侧边栏中打开和使用，然后再扩展更深入的 vault 感知能力。

## 5. 仓库和版本管理

开发应通过专门为该插件创建的 GitHub 仓库进行管理。

预期工作流：

- 为 Codeian 创建新的 GitHub 仓库。
- 将所有插件源代码、文档、发布说明和项目决策保存在该仓库中。
- 使用 Git commit 跟踪每个有意义的开发步骤。
- 对较大的实验或高风险变更使用分支。
- 使用 tag 和 GitHub release 管理演示构建和可发布插件版本。
- 开发过程中保持本地仓库与 GitHub remote 同步。

GitHub 访问安全规则：

- 不要提交 GitHub token、API key、凭据或个人密钥。
- 不要把 token 存放在项目 Markdown 文件、源码文件、配置文件或已提交的 shell 脚本中。
- 使用本地环境变量、macOS Keychain、GitHub CLI 认证或其他安全凭据存储方式访问 GitHub。
- 如果 token 被意外暴露，应先在 GitHub 中撤销该 token 并生成新 token，然后再继续。

## 6. 首个演示版本开发规则

### 开发环境

- 除非有明确理由，否则应从官方 `obsidianmd/obsidian-sample-plugin` 结构开始。
- 插件代码使用 TypeScript。
- 开发期间将插件逻辑与真实生产 vault 隔离。
- 创建专门的 Obsidian 测试 vault 进行手动测试。

### 文件和数据安全

- 永远不要假设用户的 vault 布局。
- 不要硬编码 `.obsidian` 路径。
- 使用 Obsidian 官方 API 进行文件操作。
- 将笔记写入、移动、删除和重命名视为高风险操作。
- 尽可能让破坏性操作或批量操作显式、可逆。

### 启动和运行时行为

- 保持 `onload()` 最小化。
- 将昂贵初始化推迟到 `workspace.onLayoutReady()`。
- 避免在启动期间扫描大型 vault。
- 除非严格必要且明确可选，否则避免在启动期间发起网络请求。

### 移动端兼容性

- 如果插件需要支持移动端，应避免顶层 Node 或 Electron import。
- 将平台特定行为放在运行时检查之后。
- 优先使用可同时在桌面端和移动端工作的 API。

### UX 和设置

- 除非必要，不要定义默认快捷键。
- 保持命令名称清晰，并以动作导向。
- 将可配置行为放入设置页。
- 使用 `Plugin.loadData()` 和 `Plugin.saveData()` 存储插件设置。
- 面向用户的文案应简洁、具体。

### 安全和隐私

- 除非功能明确、可选、有文档说明且默认关闭，否则不要添加遥测。
- 未经用户明确同意，不要将 vault 内容发送到外部服务。
- 不要将认证密钥放入源码或本地已提交文件。

## 7. 发布检查清单

在发布或准备提交社区插件之前：

- 确认 `manifest.json` 完整且准确。
- 确认 `README.md` 说明了插件目的、用法、设置和限制。
- 确认 `LICENSE` 存在。
- 从干净 checkout 构建插件。
- 在独立 vault 中测试。
- 测试插件启动性能。
- 检查移动端兼容性假设。
- 创建包含必要发布文件的 GitHub release。
- 如果发布到社区插件市场，向 `obsidianmd/obsidian-releases` 提交 pull request。
