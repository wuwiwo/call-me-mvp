# 主题切换 · 任务卡集合（S1-S5）

> 本文件包含主题切换功能的所有任务卡。外部 AI 按顺序执行 S1→S5。
> 每张卡完成后**自行验收**（对照 ACCEPTANCE CRITERIA）→ 合并到 main → push → 开始下一张。
> 设计定稿见 [`docs/DESIGN_THEME_SWITCH.md`](DESIGN_THEME_SWITCH.md)（Human 已逐条拍板）。
> Human 新增要求：页面不跳转 / 保持轻量（不引入大型框架）/ 工程化组件化 / 准备接入 PWA。
> 创建日期：2026-09-20

---

## S1 — CSS 令牌化（视觉零变化）

PHASE: UI / Refactor
PRIORITY: P2

### OBJECTIVE

把 `index.css` `:root` 之外的约 61 行 + `history.css` 约 21 行硬编码色（`#hex` / `rgba()`）收敛为 `:root` 语义令牌（CSS 自定义属性），**视觉零变化**。

### CONTEXT

- `index.css` `:root` 段（第 2-23 行）已有 15 个令牌定义。`:root` 之外硬编码色主要类别：
  - `rgba(55, 53, 47, X)` — 暖黑透明度变体（分隔线/背景/hover/遮罩），约 20+ 处
  - `rgba(51, 126, 169, X)` — 蓝色透明度变体（accent 背景/hover/glow），约 15+ 处
  - `rgba(229, 80, 80, X)` / `#e55050` — 红色（错误状态），约 5 处
  - `#4caf50` / `#6cd47e` — 绿色（成功状态），约 2 处
  - `#2a2a2a` / `#d4af37` — 标题金属渐变，1 处
  - `#b8932f` / `#9a7d1f` — 金色文字，约 3 处
  - `rgba(0, 0, 0, X)` / `rgba(255, 255, 255, X)` — 遮罩/白透，约 4 处
  - `#2a6a8f` — 深蓝按钮，1 处
- `history.css` 零本地令牌，用 `#eee` / `#666` / `#f8f9fa` / `#ff6b81` / `#ff4757` 等。`history.html:15` 已加载 `index.css` → `:root` 令牌两页通用。
- 必读：`docs/DESIGN_THEME_SWITCH.md` §4（令牌轴）+ §5（硬约束）+ §5.3（已知风险）

### SCOPE

- `index.css`：`:root` 之外硬编码色替换为 `var(--token)`；`:root` 新增语义令牌（不重命名现有）
- `history.css`：硬编码色替换为 `:root` 令牌引用

### NON-GOALS

- **视觉零变化**（只改写法，不改值）
- 不改 DOM 结构 / JS 逻辑
- 不改 `:root` 已有令牌名
- 不改标题渐变动画 / 背景光晕（只令牌化，不参数化 —— 参数化是 S2 的事）
- 不动 AGENTS.md（主 AI 自己同步）
- 不新增测试套件
- 不改 prettier 格式

### IMPLEMENTATION REQUIREMENTS

1. 梳理 `:root` 之外所有硬编码色，按语义归类
2. `:root` 新增语义令牌，值与原硬编码值**完全一致**，命名用语义（不用色值名）
3. 同一透明度的同一基色用于不同语义时可分拆为不同语义令牌，但**值必须一致**
4. `history.css` 同样替换为 `:root` 令牌引用
5. `:root` 令牌段保持整洁：已有不动，新增追加在末尾，按语义分组加注释

### ACCEPTANCE CRITERIA

- [ ] `index.css` `:root` 段之外 0 硬编码色
- [ ] `history.css` 0 硬编码色
- [ ] `:root` 新增令牌值与原硬编码值完全一致
- [ ] `node tools/run-all.mjs` 全量 10/10（537 项断言 0 失败）
- [ ] `node node_modules/eslint/bin/eslint.js .` 0 error
- [ ] prettier --check 0 / check-worktree 缺失 0 / git diff --check 0

### VERIFICATION

1. `grep -n '#[0-9a-fA-F]\{3,8\}[;,)\s]' index.css` 在 `:root` 段之外 0 命中
2. `grep -n '#[0-9a-fA-F]\{3,8\}[;,)\s]\|rgba\?(' history.css` 0 命中
3. `node tools/run-all.mjs` + `eslint` + `prettier --check` + `check-worktree`

### BRANCH

`codex/s1-tokenization`，从 main 当前 HEAD 创建。开工前 `git rev-parse --short HEAD` 实测。切分支后立即 `node tools/check-worktree.mjs`。

---

## S2 — 主题层（data-theme + 持久化 + 防闪）

PHASE: UI / Feature
PRIORITY: P2

### OBJECTIVE

实现主题切换的基础设施：`data-theme` 属性 + 防闪内联脚本 + `appTheme` 持久化 + history 页补 init。S2 只搭机制，不做实际切换入口（S3 做）。

### CONTEXT

- Human 定调：主题 = 令牌集 + 布局类，不是纯 CSS 变量覆盖
- FOUC 约束：ES module 是 defer，主题必须在 `<head>` 内联脚本写入 `data-theme` 后再渲染
- `history.html` 只加载 `history.js`，主题 init 要在该页补一次（照 CM-007 `language.init()` 先例）
- 持久化复用 `state.js` 的 `readJsonSafe(key, fallback, isValid)`
- 先例：`buttonDisplayMode` / `appLanguage` 已有持久化模式
- S1 已完成令牌化，`:root` 有语义令牌；S2 通过 `[data-theme="xxx"]` 覆盖令牌值

### SCOPE

- `index.html`：`<head>` 内联防闪脚本（读 `appTheme` → 写 `data-theme`）
- `history.html`：同上 + 确保加载主题 init
- `js/modules/state.js`：新增 `appTheme` 读取（复用 `readJsonSafe`，合法值校验）
- `js/modules/config.js`：新增 `themes` 配置（主题列表 + 每个主题的令牌覆盖值）
- 新增 `js/modules/theme.js`：主题模块（`init()` / `setTheme(name)` / `getTheme()` / 持久化 / 防闪）

### NON-GOALS

- 不做切换入口 UI（S3 做）
- 不做新主题的布局类（S3 做）
- 不改现有令牌值（S1 已定）
- 不改 DOM 结构（只在 `<html>` 加 `data-theme` 属性）
- 不动 AGENTS.md
- 不引入大型框架/依赖

### IMPLEMENTATION REQUIREMENTS

1. `index.html` `<head>` 最前面加内联脚本：读 `localStorage.appTheme` → `document.documentElement.setAttribute('data-theme', theme)`，在 CSS 加载前执行，防 FOUC。
2. `config.js` 新增 `themes` 配置：`{ default: "bubble", valid: ["bubble", "list"] }`（2 个主题：bubble=现状气泡列表，list=新按钮列表）。S2 只搭配置结构，实际令牌覆盖值可以是空对象（S3 填）。
3. `js/modules/theme.js`：
   - `init()`：读 `appTheme`，设 `data-theme` 属性
   - `setTheme(name)`：校验合法 → 写 `localStorage.appTheme` → 设 `data-theme` → 触发重绘
   - `getTheme()`：返回当前主题名
   - 非法/损坏 `appTheme` 回退默认（fail-safe）
4. `state.js`：新增 `appTheme` 读取（复用 `readJsonSafe`）
5. `history.html`：在 `history.js` init 前加主题 init（照 `language.init()` 先例）
6. `main.js`：在 `language.init()` 后调 `theme.init()`

### ACCEPTANCE CRITERIA

- [ ] `<html>` 有 `data-theme` 属性，值来自 `localStorage.appTheme`
- [ ] 无 FOUC（页面加载时主题在 CSS 渲染前已设置）
- [ ] 非法 `appTheme`（非字符串 / 不在 valid 列表 / 损坏 JSON）回退默认不崩
- [ ] `setTheme("list")` 后 `data-theme="list"` 持久化（刷新后保持）
- [ ] `history.html` 也有 `data-theme` 属性（与首页一致）
- [ ] `node tools/run-all.mjs` 全量 10/10（537 项断言 0 失败）
- [ ] eslint 0 error / prettier --check 0 / check-worktree 缺失 0

### VERIFICATION

1. 浏览器控制台：`localStorage.setItem('appTheme','list')` → 刷新 → `document.documentElement.dataset.theme === 'list'`
2. 非法值测试：`localStorage.setItem('appTheme','nonexistent')` → 刷新 → `data-theme` 回退默认
3. `node tools/run-all.mjs` + `eslint` + `prettier --check` + `check-worktree`

### BRANCH

`codex/s2-theme-layer`，从 S1 合并后的 main HEAD 创建。

---

## S3 — 切换入口（甲顶栏重构 + 新主题布局 + 历史入口）

PHASE: UI / Feature
PRIORITY: P1

### OBJECTIVE

实现主题切换的完整入口：甲顶栏重构（`#editButtons` 进 ⋯ 菜单但留在 DOM）+ 新主题（按钮列表）布局类 + 4 语言文案 + 480/360 断点复核 + 历史入口改为首页内切换视图（不跳转）。

### CONTEXT

- 设计定稿（`docs/DESIGN_THEME_SWITCH.md` §2）：
  - 顶栏结构：左（头像 36 + 昵称）/ 右（语言胶囊 + ⋯ 更多）
  - ⋯ 菜单从顶栏下方展开（全宽浮空卡，y=68 起，行高 56，点遮罩关闭）
  - 新主题：单列全宽按钮列表（行高 60、圆角 14、白底、左图标底 36 + 左对齐文案）
  - 进行中状态：底部独立呼叫卡（335 宽、圆角 12）
  - 顶栏材质：白色实底 + 8% 分隔线
  - 标题：薄荷青绿渐变左对齐（对比度暂不修）
- DOM 契约硬约束（`docs/DESIGN_THEME_SWITCH.md` §5.1）：`tools/*.mjs` 钉死 20 处，`#editButtons` 即使移进 ⋯ 菜单也必须留在 DOM
- 历史入口：Human 要求不跳转，首页内切换视图（不是 `<a href="history.html">`）
- 4 语言文案：zh / en / ja / ko 都要齐，新增键四语言齐全且取值互不相同

### SCOPE

- `index.html`：顶栏重构（头像+昵称左 / 语言胶囊+⋯右）+ ⋯ 菜单（编辑资料/编辑按钮/主题切换）+ 底部历史入口
- `index.css`：新主题（`[data-theme="list"]`）布局类（单列按钮列表 + 底部呼叫卡 + ⋯ 菜单样式）+ 甲顶栏样式 + 主题切换相关令牌覆盖
- `js/modules/theme.js`：新增切换 UI 逻辑（⋯ 菜单内主题切换触发 `setTheme`）
- `js/modules/language.js` + `translations.js`：新增 4 语言文案（主题切换相关 + 历史入口 + ⋯ 菜单项）
- `js/modules/config.js`：`themes` 配置填入实际令牌覆盖值
- `js/modules/buttonManager.js`（可能）：渲染逻辑适配新主题布局（不改 DOM 结构，只改 CSS 类）
- `history.html`：顶栏同步重构（复用 `.top-bar`）

### NON-GOALS

- 不删改 DOM 结构与 id（DOM 契约硬约束）
- 不做深色模式
- 不修标题对比度（Human 暂不修）
- 不改 `tools/*.mjs` 测试
- 不引入大型框架/依赖
- 不动 AGENTS.md

### IMPLEMENTATION REQUIREMENTS

1. 顶栏重构：`#editButtons` 移进 ⋯ 菜单但**节点必须留在 DOM**（隐藏元素仍可被 `.click()`，测试如此驱动）
2. ⋯ 菜单：从顶栏下方展开（全宽浮空卡），点遮罩关闭
3. 新主题 `[data-theme="list"]`：单列全宽按钮列表 + 底部独立呼叫卡 + 白色实底顶栏
4. 主题切换：⋯ 菜单内点击切换 → `theme.setTheme(name)` → 布局类切换
5. 历史入口：首页底部「查看通知历史」→ 不跳转，首页内动态切换到历史视图（显示历史内容，隐藏首页内容；返回时切回）
6. 4 语言文案：主题切换 + ⋯ 菜单项 + 历史入口 + 返回，四语言齐全且取值互不相同
7. 480/360 断点复核：顶栏控件数量变化后同步适配
8. `zh.history.webhookLabel` 保持 `Webhook`（被 `tools/input-safety.mjs:1024` 钉死）

### ACCEPTANCE CRITERIA

- [ ] `#editButtons` 仍在 DOM（`document.getElementById('editButtons')` 非 null）
- [ ] ⋯ 菜单从顶栏下方展开，点遮罩关闭
- [ ] 主题切换可工作：切到 "list" 后按钮列表布局生效
- [ ] 历史入口不跳转：点击后首页内切换视图，URL 不变
- [ ] 4 语言文案齐全且取值互不相同
- [ ] `node tools/run-all.mjs` 全量 10/10（537 项断言 0 失败）
- [ ] eslint 0 error / prettier --check 0 / check-worktree 缺失 0

### VERIFICATION

1. 页面级：切主题 → 按钮布局变化 → 切回 → 布局恢复
2. 页面级：点历史入口 → 首页内切换视图 → URL 不变 → 返回
3. `document.getElementById('editButtons')` 非 null（DOM 契约）
4. `node tools/run-all.mjs` + `eslint` + `prettier --check` + `check-worktree`

### BRANCH

`codex/s3-switch-entry`，从 S2 合并后的 main HEAD 创建。

---

## S4 — 组件化

PHASE: UI / Architecture
PRIORITY: P3

### OBJECTIVE

将现有模块进一步组件化，提高可维护性和复用性。保持原生 JS ES Modules，不引入大型框架。

### CONTEXT

- Human 新增要求：工程化/组件化
- 现有模块：`buttonManager` / `notification` / `countdown` / `profile` / `language` / `password` / `onboarding` / `sounds` / `state` / `config` / `theme`
- S3 完成后页面有：顶栏、按钮列表、底部呼叫卡、⋯ 菜单、历史视图、密码模态框等可复用区块
- 约束：保持原生 JS ES Modules，不引入 React/Vue/Svelte 等框架

### SCOPE

- 评估现有模块的组件化机会（哪些区块可以抽成独立组件）
- 抽取高频复用的 UI 区块为组件模块（如顶栏组件、按钮列表组件、⋯ 菜单组件）
- 组件接口：`render(container)` / `mount()` / `unmount()` / `update(props)`

### NON-GOALS

- 不引入大型框架（React/Vue/Svelte）
- 不改变产品行为
- 不改 DOM 契约（id/class 钉死的不能动）
- 不重构全部模块（只抽取高频复用区块）
- 不动 AGENTS.md

### IMPLEMENTATION REQUIREMENTS

1. 评估现有模块，列出可组件化的区块（至少 3 个候选）
2. 抽取为独立组件模块（`js/components/xxx.js`）
3. 组件接口标准化：`render(container)` / `mount()` / `unmount()` / `update(props)`
4. 现有模块改为消费组件（不改产品行为）
5. 保持 ESM 模块化，不引入打包工具

### ACCEPTANCE CRITERIA

- [ ] 至少 3 个 UI 区块抽成独立组件模块
- [ ] 组件接口标准化（render/mount/unmount/update）
- [ ] 产品行为不变（`node tools/run-all.mjs` 全量 10/10）
- [ ] eslint 0 error / prettier --check 0 / check-worktree 缺失 0

### VERIFICATION

1. `node tools/run-all.mjs` + `eslint` + `prettier --check` + `check-worktree`
2. 组件模块可独立 import 并 render（不依赖全局状态）

### BRANCH

`codex/s4-componentize`，从 S3 合并后的 main HEAD 创建。

---

## S5 — PWA 准备

PHASE: UI / Infrastructure
PRIORITY: P3

### OBJECTIVE

准备 PWA 接入：manifest.json + service worker + 可离线。

### CONTEXT

- Human 新增要求：准备接入为 PWA
- 当前是纯前端静态站点，无后端、无构建步骤
- 现有资源：index.html / history.html / js/ / css/ / sounds/ / images（如有）
- 约束：保持原生 JS，不引入构建工具（webpack/vite）

### SCOPE

- `manifest.json`（或 `manifest.webmanifest`）：PWA 清单（name / short_name / icons / theme_color / background_color / display / start_url）
- `sw.js`（service worker）：缓存策略（缓存优先 / 网络优先 / 运行时缓存）
- `index.html`：注册 service worker（`navigator.serviceWorker.register('/sw.js')`）
- 图标资源（如无现有图标，生成或用占位）
- 可能新增 `js/sw-register.js`（SW 注册逻辑）

### NON-GOALS

- 不引入构建工具（webpack/vite）
- 不引入大型 PWA 框架（Workbox 等）
- 不改现有产品行为
- 不做推送通知（notification API）—— 与现有 webhook 通知不同
- 不动 AGENTS.md

### IMPLEMENTATION REQUIREMENTS

1. `manifest.json`：name="Call Me MVP" / display="standalone" / theme_color/background_color 用令牌值 / icons 至少 192+512
2. `sw.js`：缓存策略 —— 静态资源（js/css/html/sounds）缓存优先，JSONBin 请求网络优先
3. `index.html`：`<link rel="manifest" href="manifest.json">` + `<head>` 末尾注册 SW
4. SW 注册在页面 load 后（不阻塞首屏）
5. SW 更新策略：`skipWaiting` + `clients.claim`（或提示用户刷新）

### ACCEPTANCE CRITERIA

- [ ] `manifest.json` 存在且通过 PWA 验证（Chrome DevTools > Application > Manifest）
- [ ] `sw.js` 存在且能注册（Chrome DevTools > Application > Service Workers）
- [ ] 离线模式：断网后页面可加载（静态资源从缓存）
- [ ] `node tools/run-all.mjs` 全量 10/10（537 项断言 0 失败）
- [ ] eslint 0 error / prettier --check 0 / check-worktree 缺失 0

### VERIFICATION

1. Chrome DevTools > Application > Manifest 无报错
2. Chrome DevTools > Application > Service Workers 显示已注册
3. Chrome DevTools > Network > Offline → 刷新页面 → 页面可加载
4. `node tools/run-all.mjs` + `eslint` + `prettier --check` + `check-worktree`

### BRANCH

`codex/s5-pwa`，从 S4 合并后的 main HEAD 创建。

---

## 执行流程

```text
S1 令牌化 → 验收 → 合并 main → push
  ↓
S2 主题层 → 验收 → 合并 main → push
  ↓
S3 切换入口 → 验收 → 合并 main → push
  ↓
S4 组件化 → 验收 → 合并 main → push
  ↓
S5 PWA → 验收 → 合并 main → push
```

每张卡完成后：
1. 对照 ACCEPTANCE CRITERIA 自验
2. `node tools/check-worktree.mjs` 确认工作区完整
3. 快进合并到 main（切 main 时若触发级联，守卫会自动恢复）
4. 合并后跑 `node tools/run-all.mjs` 复核
5. push（直连失败时带代理 `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main`）
6. 开始下一张卡
