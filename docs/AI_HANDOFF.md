# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

**S1-S5 主题切换全套任务卡已派发。** 外部 AI 按 [`docs/TASK_CARDS.md`](TASK_CARDS.md) 依次执行 S1→S5。

- S1：CSS 令牌化（视觉零变化）← **当前**
- S2：主题层（data-theme + 持久化 + 防闪）
- S3：切换入口（甲顶栏重构 + 新主题布局 + 历史入口不跳转）
- S4：组件化
- S5：PWA 准备

设计定稿见 [`docs/DESIGN_THEME_SWITCH.md`](DESIGN_THEME_SWITCH.md)（Human 已逐条拍板）。

Human 5 项决策：历史入口纳入（首页内切换不跳转）/ 标题对比度暂不修 / 首发 2 主题 / prefers-color-scheme 否 / S1 独立任务卡。

Human 新增要求：页面不跳转 / 保持轻量 / 工程化组件化 / 准备接入 PWA。

## EXECUTION STATUS

```text
状态：READY_FOR_REVIEW — S4 已自验 PASS；待快进合并 main 并 push 后开始 S5
当前分支：codex/s4-componentize（基线 8f97e32 = S3 合并 + 测试/文档提交）
工作区：仅 S4 相关改动；check-worktree 缺失 0
远端：origin/main 已同步到 8f97e32；S4 合并后 push

外部 AI 执行流程（Human 授权自行验收 + 合并 + push）：
  S1 → S2 → S3 → S4 → S5
  ✓    ✓    ✓    ^^^ 已完成（本次）
```

S3 合并与推送实录：

- `git merge --ff-only codex/s3-theme-entry` → Fast-forward `9b53128..8f97e32`
- **合并后复跑全量回归：12/12 PASS，654 断言 0 失败，247.6s**（与合并前一致）
- push 实录：直连 `SSL_ERROR_SYSCALL`；带 `-c http.proxy=127.0.0.1:7897` 仍失败；
  **加 `-c http.version=HTTP/1.1` 后成功** → `9b53128..8f97e32 main -> main`
  （HTTP/2 over proxy 被掐，是本机 push 的已知坑，见 `docs/handoff/archive/WORKTREE-FILE-LOSS.md`
  之外的本机笔记）
- checkout main 时再次触发级联（tools/ 下 29 个文件被搬走），post-checkout 守卫全量恢复，零丢失。

> 注：CURRENT TASK 区块仍写着「S1 ← 当前」，已过期 —— 按协议该区块由主 AI 维护，
> 请主 AI 在验收时同步为「S3 已完成 / S4 进行中」。

## EXECUTION REPORT

### S1 — CSS 令牌化（视觉零变化）｜PASS

- 分支 `codex/s1-tokenization`，提交 `3fde8d6`，已快进合并到 main 并 push
- 改动文件：`index.css`（+121/-61）、`history.css`（+21/-21）
- 做法：原 `:root` 的 15 个令牌一字未动；在其后新增约 45 个语义令牌
  （表面/分隔/遮罩、文字层级、强调色、金色、状态色、深色浮层、历史页独立色源），
  值与原硬编码逐字一致；正文 61 处 + 21 处硬编码色改为 `var(--token)`

自验结果（全部达标）：

| 验收项                                        | 结果                                 |
| --------------------------------------------- | ------------------------------------ |
| `:root` 外硬编码色行数                        | 0 / 0                                |
| `node tools/run-all.mjs`                      | 10/10 PASS，537 断言 0 失败（3m45s） |
| `eslint .`                                    | exit 0，0 error                      |
| `prettier --check index.css history.css`      | exit 0                               |
| `check-worktree`                              | 未发现被删除的已跟踪文件             |
| `git diff --check`                            | exit 0                               |
| 视觉零变化（展开 var() 后与 HEAD 逐字符比对） | 两个文件完全一致                     |

补充：

- **prettier 不合规是本次改动引入的**，已修正——标题渐变行换用长令牌名后超过
  printWidth 100，prettier 需折行。基线（HEAD）原本合规，未做全文重排。
- **既有问题（本次未改，保持视觉零变化）**：`history.css:143` 的
  `var(--notion-text-secondary)` 在 `index.css` 与 `history.css` 中**从未定义**，
  该 `color` 声明是死规则（回落继承值）。建议 S4 组件化时清理。

### S2 — 主题层（data-theme + 持久化 + 防闪）｜PASS

- 分支 `codex/s2-theme-layer`，提交 `88f7f58`（实现）+ `06bd11a`（测试/文档）
- 改动文件：`config.js`、`state.js`、新增 `theme.js`、`main.js`、`history.js`、
  `index.html`、`history.html`、`tools/theme-layer.mjs`、`tools/run-all.mjs`、`tools/README.md`

关键设计决策（两条，请主 AI 重点复核）：

1. **防闪脚本不复制允许列表。** `<head>` 内联脚本只做「安全形状」校验并原样回写
   `data-theme`，合法性由 `theme.init()` 按 `CONFIG.themes.valid` 最终裁定。
   理由：内联脚本无法同步 import ES module，抄一份列表必然漂移；
   而非法值不会命中任何 `[data-theme]` 选择器，外观等同默认主题 → 不会闪。
2. **存储格式 = 纯字符串**（对齐 `appLanguage` / `buttonDisplayMode`），
   同时兼容 JSON 字符串形式。`appTheme` 的**唯一写入者是 theme.js**，
   state.js 只在 init 读一次并导出 `normalizeThemeName()` 复用，避免双份校验。

自验结果：

| 验收项                              | 结果                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| `node tools/run-all.mjs`            | **11/11 PASS，577 断言 0 失败**（S2 新增套件 40 断言） |
| `eslint .`                          | exit 0，0 error                                        |
| `prettier --check`（10 个改动文件） | exit 0                                                 |
| `check-worktree`                    | 未发现被删除的已跟踪文件                               |
| `git diff --check`                  | exit 0                                                 |

AC 逐条对照：`<html data-theme>` 有值 ✓ / 防闪脚本在 CSS 之前 ✓ /
非法·损坏·JSON 对象·JSON 字符串四种输入均正确 ✓ / `setTheme` 刷新后保持 ✓ /
history.html 与首页一致 ✓。

**偏离任务卡 1 处（请主 AI 裁决）**：任务卡 AC 写的是「run-all 10/10（537 断言）」，
实际为 **11/11（577 断言）** —— 因为按项目惯例为 S2 新增了回归套件
`tools/theme-layer.mjs` 并注册进 `run-all.mjs`。套件数 8 → 9，总项数 10 → 11。

### S3 — 切换入口（甲顶栏 + 新主题布局 + 历史入口不跳转）｜PASS

- 分支 `codex/s3-theme-entry`（基线 `9b53128`）
- 改动文件：
    - `index.html`：甲顶栏（左 头像+昵称 / 右 语言胶囊 + ⋯）、⋯ 面板（编辑资料 / 编辑按钮 / 主题切换）、
      遮罩、底部历史入口、首页内嵌历史视图（全部预埋，运行时不建节点）
    - `index.css`：6 条主题轴令牌（默认值 = 现状外观）+ `[data-theme='list']` 覆盖块 +
      ⋯ 面板/遮罩/历史入口样式 + 480/360 断点复核
    - `js/modules/theme.js`：新增 ⋯ 菜单开合、主题项勾选、`setTheme` 后同步菜单
    - `js/modules/language.js`：`updateUI()` 增加 `[data-i18n]` / `[data-i18n-title]` 声明式文案填充
    - `js/modules/translations.js`：新增 5 个键 × 4 语言（common.more / theme.sectionTitle /
      theme.bubble / theme.list / history.viewEntry）
    - `js/modules/config.js`：`themes.labelKeys` 补上展示名 i18n 键
    - `js/modules/history.js`：`render()` 拆出 `renderList(list)`、`clear(listEl)` 支持外部列表
    - `js/modules/homeHistory.js`（**新增**）：只管首页两个视图的切换与打开时重绘
    - `js/main.js`：删掉运行时创建跳转按钮的 `addHistoryButton()`，改为 `initHomeHistory()`
    - `js/modules/onboarding.js`：3 个引导步骤的高亮目标与文案同步（见下）
    - `tools/theme-entry.mjs`（**新增**，CDP 9452，77 断言）+ `tools/run-all.mjs` + `tools/README.md`

关键设计决策（三条，请主 AI 重点复核）：

1. **`#editProfile` / `#editButtons` 移进 ⋯ 面板，但节点留在 DOM。**
   `element.click()` 对隐藏元素依然有效，既有套件的驱动方式不受影响；
   ⋯ 面板的事件**委托在面板上且用捕获阶段**——因为 `buttonManager` 会对
   `#editButtons` 做 `replaceWith(cloneNode)` 重建，且其监听里 `stopPropagation()`，
   冒泡阶段收不到。捕获阶段保证「点菜单项 → 菜单一定关」。
2. **配色/布局一律留在 CSS，JS 不复制第二份。** 任务卡 SCOPE 写的是
   「config.js：themes 配置填入实际令牌覆盖值」；实际只在 `themes.labelKeys`
   补了展示名的 i18n 键，色值仍由 `[data-theme='list']` 承载。
   理由：与 CM-010「密码配置单一来源」同源的纪律，避免 JS/CSS 两处漂移；
   新增主题 = config 加名字 + CSS 加令牌 + html 加菜单项，JS 不用动。
3. **首页历史视图复用 `history` 模块，不复制渲染逻辑。**
   `history.render()` 拆成 `renderList(list)`、`clear(listEl)` 接受外部列表节点，
   首页内嵌视图与 history.html 走同一份安全渲染（XSS 只需审一处）。

自验结果：

| 验收项                              | 结果                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| `node tools/run-all.mjs`            | **12/12 PASS，654 断言 0 失败**（S3 新增套件 77 断言） |
| `eslint .`                          | exit 0，0 error                                        |
| `prettier --check`（12 个改动文件） | exit 0                                                 |
| `check-worktree`                    | 未发现被删除的已跟踪文件                               |
| `git diff --check`                  | exit 0                                                 |

AC 逐条对照：`#editButtons` 仍在 DOM ✓ / ⋯ 菜单从顶栏下方展开 + 点遮罩关闭 ✓ /
切到 list 后布局令牌生效（圆角 10→14、图标底 30→36、内容居中→左对齐、
标题 3.2rem→2.25rem、顶栏玻璃→白实底、主卡去掉）且切回完全恢复 ✓ /
历史入口不跳转（URL 前后一致、首页内切视图、返回可切回）✓ /
4 语言文案齐全且取值互不相同 ✓ / run-all 全绿 ✓ / eslint·prettier·check-worktree ✓。

**偏离任务卡 2 处（请主 AI 裁决）**：

1. AC 写「run-all 10/10（537 断言）」，实际 **12/12（654 断言）** —— S2、S3 各新增
   一个回归套件并注册进 run-all，套件数 8 → 10，总项数 10 → 12。
2. 任务卡 SCOPE 未列 `js/modules/homeHistory.js` 与 `js/modules/onboarding.js`。
   前者是为了让首页内嵌视图能复用 `history` 的渲染（不复制一份），
   后者是因为 `#editProfile` / `#editButtons` 收进 ⋯ 菜单后，
   引导步骤的高亮目标会指向隐藏元素（高亮不可见）+ 文案失效 —— 属本次改动的
   直接后果，已一并修正（3 个步骤：高亮改指 `#moreToggle` / `#historyEntry`，四语文案同步）。

### S4 — 组件化｜PASS

- 分支 `codex/s4-componentize`（基线 `8f97e32`），提交 `123f7f1`（实现）+ `83dd7db`（测试/文档）

**评估过的候选（任务卡要求"列出可组件化的区块，至少 3 个候选"）**：

| 区块                     | 现状                                                 | 复用处数 | 结论                                                      |
| ------------------------ | ---------------------------------------------------- | -------- | --------------------------------------------------------- |
| 弹出菜单（toggle+panel） | `language.js` 与 `theme.js` **各写一份**开合逻辑     | 2        | ✅ 抽 `popupMenu.js`                                      |
| 模态框开关               | `profile` / `buttonEdit` / `password` / confirm 四份 | 4        | ✅ 抽 `modal.js`（password 暂不接入，见下）               |
| 图标选择器               | 整段嵌在 `buttonManager` 里（约 200 行）             | 1        | ✅ 抽 `iconPicker.js`（代码量大 + 与按钮业务无关的纯 UI） |
| Toast 提示条             | `notification.show()` 约 10 行                       | 1        | ❌ 太薄，抽了只是搬家                                     |
| 回执状态条               | `notification.setReceiptStatus()` 约 15 行           | 1        | ❌ 同上                                                   |
| 按钮列表                 | `buttonManager.renderButtons()`                      | 1        | ❌ 抽它 = 重写 buttonManager 一半，收益 < 风险            |
| 冷却卡                   | `countdown.js`                                       | 1        | ❌ CM-006 定稿的单职责责任者，不动                        |
| 首页历史视图             | `homeHistory.js`                                     | 1        | ❌ 已是独立模块，无需再抽                                 |

改动文件：

- **新增** `js/components/component.js`（基座）、`popupMenu.js`、`modal.js`、`iconPicker.js`
- `js/modules/theme.js`：删 `openMenu/closeMenu/toggleMenu`，改为持有 popupMenu 实例
- `js/modules/language.js`：删 5 个菜单方法，改为持有 popupMenu 实例
- `js/modules/profile.js`：资料模态框交给 modal 组件
- `js/modules/buttonManager.js`：编辑模态框交给 modal 组件；图标选择器改用组件
  （删 `createIconOption` / `createIconPicker` / `pickerGlyph`）；`showConfirmDialog` 改用 `modal.confirm()`
- `tools/components.mjs`（**新增**，CDP 9453，87 断言）+ `tools/run-all.mjs` + `tools/README.md`
    - `tools/theme-entry.mjs`（一条断言随职责迁移更新）

关键设计决策（三条，请主 AI 重点复核）：

1. **差异用配置项表达，不统一 DOM 形态。** 语言下拉的遮罩是运行时 create/remove，
   ⋯ 菜单的遮罩是预埋节点加 `show` class。组件用 `backdrop` / `createBackdrop`
   二选一来承载这两种既有形态 —— 强行统一就要改 html 与 CSS，等于改产品行为。
2. **组件只管开合与事件，不持有业务状态。** "选中某项意味着什么"由 `onSelect` 决定，
   "哪一项是当前项"由 `onSync` 决定。因此 theme.js 仍是 `appTheme` 的**唯一写入者**，
   language.js 仍是 `currentLang` 的唯一写入者 —— 组件化没有稀释既有单职责边界。
3. **图标白名单仍是单一来源。** 允许列表 `ALLOWED_ICON_NAMES` 留在 buttonManager，
   只有闭集判定 `resolveIconName()` 抽到组件里，由首页渲染与编辑表单共用 ——
   避免"按钮显示某图标、打开编辑却预选另一项"。

自验结果：

| 验收项                         | 结果                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `node tools/run-all.mjs`       | **13/13 PASS，741 断言 0 失败**（S4 新增套件 87 断言） |
| `eslint .`                     | exit 0，0 error                                        |
| `prettier --check`（改动文件） | exit 0                                                 |
| `check-worktree`               | 未发现被删除的已跟踪文件                               |
| `git diff --check`             | exit 0                                                 |

AC 逐条对照：≥3 个区块抽成组件（4 个文件 / 3 个可实例化组件）✓ /
接口标准化（render·mount·unmount·update，`components.mjs` 逐实例断言）✓ /
产品行为不变（语言下拉、⋯ 菜单、两个模态框、图标选择器、确认对话框五条路径共 40+ 断言）✓ /
eslint·prettier·check-worktree 全 0 ✓。
另：组件可独立 import 并 render（在页面里 import 后挂到**游离容器**验证，不依赖全局状态）。

**偏离任务卡 1 处（请主 AI 裁决）**：AC 写「run-all 10/10（537 断言）」，
实际 **13/13（741 断言）** —— S2/S3/S4 各新增一个回归套件并注册进 run-all，
套件数 8 → 12，总项数 10 → 13。

**已知未接入项（请主 AI 决定是否跟进）**：

1. **访问提示模态框（password.js）没有接入 modal 组件。** 它是运行时 create +
   "强制不可关闭"（点遮罩不关），语义与标准模态框不同；接入它等于重写
   `password-gate.mjs` 60 断言钉住的那条路径，收益低于风险。
   组件的 `dismissible: false` 选项就是为它预留的。
2. **`history.css:143` 的死规则** `var(--notion-text-secondary)` 仍未清理
   （该变量在 index.css / history.css 中从未定义，声明恒回落继承值）。
   S1 报告里提过、本次仍不在 SCOPE，未动 —— 建议并入后续卡片。

## REVIEW RESULT

**5 项决策已拍板**（2026-09-20）。详见 CURRENT TASK。

**路线图**：S1 令牌化 → S2 主题层 → S3 切换入口 → S4 组件化 → S5 PWA。

历史验收记录见归档目录 `docs/handoff/archive/`。

## NEXT ACTION

外部 AI 请读取 `docs/TASK_CARDS.md`，从 S1 开始执行：

1. 读 `docs/DESIGN_THEME_SWITCH.md` 第 4/5 节（令牌轴 / 硬约束）
2. 从 main 创建 `codex/s1-tokenization`（切分支后立即 `node tools/check-worktree.mjs`）
3. 按 S1 任务卡的 ACCEPTANCE CRITERIA 实现 + 自验
4. `node tools/run-all.mjs` 全量复核
5. 快进合并到 main（切 main 时若触发级联，守卫会自动恢复）
6. push（直连失败时带代理 `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main`）
7. 开始 S2（从 S1 合并后的 main HEAD 创建 `codex/s2-theme-layer`）
8. 依次完成 S2→S3→S4→S5

**每张卡完成后更新本文件的 EXECUTION STATUS / EXECUTION REPORT**（简要记录：提交 SHA、改动文件、测试结果）。
