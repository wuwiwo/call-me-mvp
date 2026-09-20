# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

S1 — CSS 令牌化（视觉零变化）

PHASE: UI / Refactor
PRIORITY: P2

OBJECTIVE:

把 `index.css` `:root` 之外的约 61 行 + `history.css` 约 21 行硬编码色（`#hex` / `rgba()`）收敛为 `:root` 语义令牌（CSS 自定义属性），**视觉零变化**。

这是主题切换功能（`docs/DESIGN_THEME_SWITCH.md`）的第一步：Human 定调「先做令牌化，消灭硬编码色」。令牌化后 S2 才能通过 `data-theme` 覆盖令牌实现主题切换。

CONTEXT:

- `index.css` `:root` 段（第 2-23 行）已有 15 个令牌定义（`--primary` / `--accent` / `--glass-bg` / `--shadow-*` 等）。
- `:root` 之外的硬编码色主要类别：
  - `rgba(55, 53, 47, X)` — 暖黑透明度变体（分隔线/背景/hover/遮罩），约 20+ 处，透明度从 0.025 到 0.82
  - `rgba(51, 126, 169, X)` — 蓝色透明度变体（accent 背景/hover/glow），约 15+ 处，透明度从 0.05 到 0.13
  - `rgba(229, 80, 80, X)` / `#e55050` — 红色（错误状态），约 5 处
  - `#4caf50` / `#6cd47e` — 绿色（成功状态），约 2 处
  - `#2a2a2a` / `#d4af37` — 标题金属渐变，1 处（`index.css:171`）
  - `#b8932f` / `#9a7d1f` — 金色文字，约 3 处
  - `rgba(0, 0, 0, X)` — 黑色遮罩，约 2 处
  - `rgba(255, 255, 255, X)` — 白色透明，约 2 处
  - `#2a6a8f` — 深蓝按钮，1 处
- `history.css` 零本地令牌，用 `#eee` / `#666` / `#f8f9fa` / `#ff6b81` / `#ff4757` 等（与首页不同源）。但 `history.html:15` 已加载 `index.css` → `:root` 令牌两页通用。
- 设计文档 `docs/DESIGN_THEME_SWITCH.md` §4（布局令牌轴）+ §5（硬约束）+ §5.3（已知风险）是必读上下文。

SCOPE:

- `index.css`：`:root` 之外的所有硬编码色替换为 `var(--token)` 引用；在 `:root` 新增语义令牌（不重命名现有令牌，只新增）
- `history.css`：所有硬编码色替换为 `:root` 令牌引用（复用 `index.css` 的 `:root`，因为 `history.html` 已加载 `index.css`）

NON-GOALS:

- **视觉零变化**：替换前后渲染结果像素级一致（只改写法，不改值）
- 不改 DOM 结构、不改 JS 逻辑
- 不改 `:root` 已有令牌名（只新增语义令牌）
- 不改 `password.js:172` 内联样式（不是色值，是 `display` 属性）
- 不改标题渐变动画（`titleShine`）
- 不改背景 radial 光晕（只令牌化，不参数化 —— 参数化是 S2 的事）
- 不动 AGENTS.md（主 AI 自己同步）
- 不新增测试套件（令牌化不改行为，既有 537 项断言已覆盖）
- 不改 prettier 格式（已在 CM-001-TD-09 达标）

IMPLEMENTATION REQUIREMENTS:

1. 梳理 `index.css` `:root` 之外的所有硬编码色，按语义归类（分隔线/文本层级/accent 背景/状态色/遮罩/标题渐变等）。
2. 在 `:root` 新增语义令牌，令牌值与原硬编码值**完全一致**。命名用语义（如 `--divider` / `--text-secondary` / `--accent-bg` / `--error-color` / `--success-color` / `--overlay` 等），不用色值名。
3. 同一透明度的同一基色如果用于不同语义（如 `rgba(55,53,47,0.08)` 既做分隔线又做 hover 背景），可以分拆为不同语义令牌（如 `--divider` 和 `--hover-bg`），也可以合并（如 `--surface-overlay-08`）—— 由执行 AI 判断，但**值必须一致**。
4. `history.css` 的硬编码色同样替换为 `:root` 令牌引用。如果 `:root` 没有对应语义令牌，在 `:root` 新增。
5. `:root` 令牌定义段保持整洁：已有令牌不动，新增令牌追加在末尾，按语义分组加注释。
6. 视觉零变化：同一个色值替换前后必须渲染出完全相同的像素。

ACCEPTANCE CRITERIA:

- [ ] `index.css` `:root` 之外 0 硬编码色（`#hex` / `rgba()` 在 `:root` 段之外不出现）
- [ ] `history.css` 0 硬编码色
- [ ] `:root` 新增的语义令牌值与原硬编码值完全一致
- [ ] `node tools/run-all.mjs` 全量 10/10 通过（537 项断言 0 失败，既有套件不回归）
- [ ] `node node_modules/eslint/bin/eslint.js .` 0 error
- [ ] `node node_modules/prettier/bin/prettier.cjs --check "**/*.{js,mjs,html,css,json,md}" --ignore-path .prettierignore` 0
- [ ] `node tools/check-worktree.mjs` 缺失 0
- [ ] `git diff --check` 0

VERIFICATION:

1. `grep -n '#[0-9a-fA-F]\{3,8\}[;,)\s]' index.css` 在 `:root` 段（第 2-23 行）之外 0 命中；`grep -n 'rgba\?(' index.css` 同理
2. `grep -n '#[0-9a-fA-F]\{3,8\}[;,)\s]\|rgba\?(' history.css` 0 命中
3. `node tools/run-all.mjs` 全量
4. `node node_modules/eslint/bin/eslint.js .` + `prettier --check` + `check-worktree` + `git diff --check`

BRANCH:

从本地 `main` 的当前最新稳定 HEAD `44ec8d9` 创建并使用：`codex/s1-tokenization`。开工前必须 `git rev-parse --short HEAD` 实测确认。

注意：本机存在「checkout/merge 触发工作区级联丢失」环境缺陷。**创建/切换分支后必须立即运行 `node tools/check-worktree.mjs`**；若已跟踪文件缺失，先确认非有意删除，再 `git restore -- <路径>` 恢复。守卫已移出 `tools/` 到 `scripts/` + `.git/`（GOV-002），实测切分支时若两个分支都有 `scripts/worktree-guard.mjs` 则不触发级联。**验收前不得合并 main、不得 push**。

## EXECUTION STATUS

```text
状态：DISPATCHED — S1 任务卡已写入，等待外部 AI 执行
任务分支：codex/s1-tokenization（待外部 AI 创建）
任务基线：44ec8d9（main 当前 HEAD）
设计文档：docs/DESIGN_THEME_SWITCH.md（Human 已逐条拍板，代码零改动）
```

## EXECUTION REPORT

（外部 AI 完成后填写）

## REVIEW RESULT

**5 项决策已拍板**（2026-09-20，Human 确认）：

| # | 决策 | 结果 |
|---|---|---|
| 1 | 历史入口 | 纳入（首页内切换视图，不跳转） |
| 2 | 薄荷标题对比度 | 暂不修 |
| 3 | 首发主题数量 | 2 个（现状 + 新） |
| 4 | prefers-color-scheme | 否 |
| 5 | S1 独立任务卡 | 是 |

**Human 新增要求**：页面不跳转 / 保持轻量 / 工程化组件化 / 准备接入 PWA。

**路线图**：S1 令牌化 → S2 主题层 → S3 切换入口（含历史入口不跳转）→ S4 组件化 → S5 PWA。

---

历史验收记录见归档目录 `docs/handoff/archive/`。

## NEXT ACTION

外部 AI 请读取最新的 `AGENTS.md` 和本文件，用 `git rev-parse --short HEAD` 确认实际 HEAD（应为 `44ec8d9`）后创建 `codex/s1-tokenization`（**创建/切换分支后立即跑 `node tools/check-worktree.mjs`**），按 `CURRENT TASK` 执行。**先读 `docs/DESIGN_THEME_SWITCH.md` 第 4/5 节**（令牌轴 / 硬约束）。完成后更新本文件的 `EXECUTION STATUS` 和 `EXECUTION REPORT`，等待主 AI 独立验收。**不要修改或合并 `main`，不要 push。**
