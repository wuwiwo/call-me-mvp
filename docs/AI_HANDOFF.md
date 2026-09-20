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
状态：READY_FOR_REVIEW — S3 已自验 PASS；待快进合并 main 并 push 后开始 S4
当前分支：codex/s3-theme-entry（基线 9b53128 = S2 合并 + prettier endOfLine 根治）
工作区：仅 S3 相关改动；check-worktree 缺失 0
远端：origin/main 已同步到 9b53128；S3 合并后 push

外部 AI 执行流程（Human 授权自行验收 + 合并 + push）：
  S1 → S2 → S3 → S4 → S5
  ✓    ✓    ^^^ 已完成（本次）
```

> 注：CURRENT TASK 区块仍写着「S1 ← 当前」，已过期 —— 按协议该区块由主 AI 维护，
> 请主 AI 在验收时同步为「S3 已完成 / S4 待派发」。

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
