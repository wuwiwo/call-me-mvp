# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

**UI-14：14 项改动（音效 / 主题 / 按钮 / 设置模态框 / 回执冷却 / 历史页 / 顶部菜单）**

完整施工图（**开工前必读**）：[`docs/HANDOFF_14_ITEMS_2026-09-20.md`](HANDOFF_14_ITEMS_2026-09-20.md)

设计稿精确规格：Ardot `727742261679190`（施工图 §1 已把关键节点的填充/圆角/间距/字重逐条抄录，
**不需要再开画布**）。

### Human 拍板（2026-09-20）

| 决策点 | 结论 |
| --- | --- |
| 主题中文名 | bubble = **浮光絮语**；list = **青笺行** |
| 历史 tag | **真三态**（未回执 / 已回执 / 失败）→ 必须新增 `receipt` 字段并回写历史 |
| G1 圆角冲突 | **以施工图为准**：窄屏面板「顶/左/右三边直角 + 底两角 16px」；`DESIGN_THEME_SWITCH.md:32` 已同步改（主 AI 已完成） |

### 本轮授权（Human 2026-09-20 21:44 明示）

**执行 AI 自行验收 + 合并 main + push，不需回主 AI 验收。**

即：施工图 §4 的 6 个原子提交全部落在 `codex/ui-14` 分支 → 自验通过后
`git checkout main && git merge --ff-only codex/ui-14` → push origin main。
**这是 Human 明确给出的授权，不属越权**（区别于既往"merge-only 不含 push"的默认约束）。

### SCOPE

`docs/HANDOFF_14_ITEMS_2026-09-20.md` §2 的 A/B/C/D/E/F/G 共 **14 条**：

- **A 音效组（4）**：A1 iOS 不生效（持久化 + unlock + 失败重试）/ A2 全局 click 音效 /
  A3 保存成功 toast + 成功音 / A4 音效开关
- **B 主题组（4）**：B1 改名（浮光絮语 / 青笺行）/ B2 四色方块图标 / B3 list 内容上移 /
  B4 模态框适配 list
- **C 按钮组（3）**：C1 恢复默认次级按钮（**根因：`.btn` 无 CSS 定义**）/ C2 六彩循环 /
  C3 历史入口保持可见
- **D 编辑模态框（1）**：D2「布局调整」气泡提示
- **E 回执 / 冷却（2）**：E1 回执卡改新版（**动 DOM，风险最高**）/ E2 文案左对齐
- **F 历史页（3）**：F1 垂直居中 + 上移 / F2 右上角三态 tag（**XSS 纪律**）/ F3 清除 toast 统一
- **G 顶部更多栏（1）**：G1 底部圆角 + hover 淡绿

### NON-GOALS

- 不改 `CONFIG.password` 语义、不动密码闸门
- 不改回执轮询节奏（`2s × 15`，`receipt-lifecycle.mjs` 钉死）
- 不改任何 DOM 契约 id（施工图 §5 列出 10 个）
- 不改 `zh.history.webhookLabel`（必须保持 `Webhook`，`input-safety.mjs:1024` 钉死）
- 不为凑测试而改断言；新增断言必须**先反向验证**确认有区分力

### ACCEPTANCE CRITERIA

1. 14 条**逐条**实现，逐条给出验证方式（不是笼统"已完成"）
2. `node tools/run-all.mjs` 全量 **0 失败**（基线 14 项 / 811 断言；新增断言允许，既有断言数不得减少）
3. `eslint .` 0 error；`prettier --check` 改动文件 0；`node tools/check-worktree.mjs` 缺失 0
4. **B1 改名必须与 `tools/theme-entry.mjs:617-618` 同一次提交**（否则套件立刻红）
5. **E1 动 DOM 后 `receipt-lifecycle.mjs` 54 项必须全绿**
6. **F2 的 tag 必须走闭合枚举 + `textContent`**（不得把 LocalStorage 值拼进 class）
7. 涉及浮层/遮罩的验证**必须**用 CDP 真实坐标（`Input.dispatchMouseEvent` + `elementFromPoint`），
   不得只用 `el.click()`
8. **A1 无法 headless 验证** → 必须在报告里显式声明"需真机确认"，不得声称已验证
9. 每个修复必须做**反向验证**（把 bug 放回去，确认新断言真的 FAIL）

### VERIFICATION（自报告须含）

- 每个 commit 的 SHA + 改动文件 + 对应施工图条目号
- `run-all` 全量输出（项数 / 断言数 / 耗时 / 退出码）
- 反向验证的重跑结果（改造前 vs 改造后的 pass/fail 对比）
- 明确列出**未验证**或**有偏离**的条目及其理由

### BRANCH

`codex/ui-14`，基线 = 开工前实测 `main` HEAD（`git rev-parse --short HEAD` 确认；
建分支后**立即** `node tools/check-worktree.mjs`）。

### 建议施工顺序（按风险，非文档字母序）

1. **C1 / B3 / G1**（只改 CSS，零 DOM 风险，最快见效）
2. **B1 + `theme-entry.mjs:617-618`**（同提交）
3. **B2 / C2 / B4**（CSS + 少量 html）
4. **A 组**（音效，独立性强）
5. **F 组**（历史页，含 XSS 纪律）
6. **E1 放最后**（动 DOM，必须全量）

---

**（历史）S1-S5 主题切换全套任务卡已完成并合并推送。** 归档见
[`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## EXECUTION STATUS

```text
状态：IN_PROGRESS — UI-14 施工中（5/6 组已完成，剩 D2 + E1 + E2）
当前分支：codex/ui-14（基线 main = 8d23ce2）
当前提交：89d3472（F 组）
工作区：干净（check-worktree 缺失 0；lint exit 0）
基线：run-all 14 项 / 811 断言 / 0 失败
当前：run-all 14 项 / 850 断言 / 0 失败（+39，F 组新增）

已完成分组（每组 = 1 个原子提交，均通过专项断言 + 反向验证 + 全量回归）：

| 提交      | 分组              | 专项断言    | 反向验证     | 全量            |
|-----------|-------------------|-------------|--------------|-----------------|
| `26c5c08` | C1 + B3 + G1      | 37/37       | —            | 14/14 · 811     |
| `0683ef5` | B1 + B2           | 34/34       | 11 FAIL ✅   | 14/14 · 811     |
| `b002d00` | B4 + C2 + C3      | 43/43       | 33 FAIL ✅   | 14/14 · 811     |
| `daf70d8` | A1 + A2 + A3 + A4 | 44/44       | 24 FAIL ✅   | 14/14 · 811     |
| `89d3472` | F1 + F2 + F3      | 82/82       | 59 FAIL ✅   | 14/14 · 850     |

未完成：D2（布局提示气泡）、E1（回执卡改版，动 DOM 风险最高）、E2（文案左对齐）

外部 AI 执行流程（Human 2026-09-20 21:44 授权：自行验收 + 合并 + push）：
  建 codex/ui-14 → 实现 14 条 → 反向验证 → run-all 全量 → 自验收
  → merge --ff-only main → push origin main → 回填 EXECUTION REPORT
```

### UI-14 施工中抓到的真问题（执行 AI 记录）

1. **`.btn` 引入后暴露既有隐患**：`#addCustomButton` 是 `"btn add-btn"`，
   `.add-btn`(784) 定义在 `.btn`(1074) **之前** → 特异度相同靠源码顺序决胜 →
   `.btn` 的 radius/padding 反压 `.add-btn`，满宽虚线按钮被压小。
   修法：`.btn` 之后按原值重新声明 `.add-btn`（4 条断言钉住）。
2. **`buttonConfig` 形状是 `{buttons:[...], activeGroup}` 不是裸数组** ——
   `loadButtonConfig` 的 isValid 是「非 null 对象且非数组」，喂数组会静默回退默认按钮。
3. **Edit 工具在"同构重复结构"上会隐式 no-op**：`more: '更多'` vs `more: '更多',`
   是不同 old_string；改四语言块必须带足够区分性上下文（否则报 success 但没改）。
4. **`goto()` 就绪判据曾写死 `.bubble-btn`**（index.html 专属）→ 历史页永远等不到，
   真正的就绪从未被判定，表现为 `SecurityError: localStorage Access is denied`。
   已修为按 URL 给判据 + 整轮重试，并加静态服务器可达性前置检查（不可达 exit 3）。
5. **反向验证必须容错**：断言段若因"被检对象缺失"而抛异常，套件会崩溃、
   只能拿到 `null passed`，无法区分"断言检出 bug"与"套件坏了"。
   已在页面内 try/catch 并把异常当观测结果返回。

### 历史（S1–S5，已完成）

S5 合并与推送实录：

- `git merge --ff-only codex/s5-pwa` → Fast-forward `abf8d29..30dc328`
- **合并后复跑全量回归：14/14 PASS，787 断言 0 失败，284.2s**
- push：`-c http.version=HTTP/1.1` + 代理 → `abf8d29..30dc328 main -> main`；
  `ls-remote` 核对远端 = 本地 = `30dc328`
- checkout main 时级联触发（43 个文件被搬走），post-checkout 守卫全量恢复，零丢失。

S4 合并与推送实录：

- `git merge --ff-only codex/s4-componentize` → Fast-forward `8f97e32..abf8d29`
- **合并后复跑全量回归：13/13 PASS，741 断言 0 失败，269.5s**
- push 实录：**加 `-c http.version=HTTP/1.1` + 代理 127.0.0.1:7897 后成功**
  → `8f97e32..abf8d29 main -> main`；`ls-remote` 核对远端 = 本地 = `abf8d29`
- checkout main 时级联再次触发（33 个文件被搬走），post-checkout 守卫全量恢复，零丢失。

> 注：以上 S1–S5 实录为历史记录，保留供追溯。CURRENT TASK 已更新为 UI-14。

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

### S5 — PWA 准备｜PASS

- 分支 `codex/s5-pwa`（基线 `abf8d29`）

改动文件：

- **新增** `manifest.json`、`sw.js`、`js/sw-register.js`、`icons/`（3 个 PNG）、
  `tools/generate-icons.py`（图标生成器）、`tools/pwa.mjs`（回归套件，CDP 9454）
- `index.html`：接 manifest link + favicon + sw-register（head 末尾）
- `history.html`：接 manifest link + favicon
- `tools/run-all.mjs`、`tools/README.md`：注册第 12 个套件
- `eslint.config.js`：给 `sw.js` 配 `globals.serviceworker` 环境（经典脚本，SW 专用全局）

关键设计决策（三条，请主 AI 重点复核）：

1. **应用代码网络优先，不是任务卡字面的"缓存优先"。**
   本项目无构建步骤、资源 URL 没有内容哈希（只有手写的 `?3.3`），
   缓存优先会让改版后的代码被旧缓存挡住（线上"改了不生效"）；
   网络优先保证联网永远最新、断网仍可离线，AC"离线可加载"照样满足。
   缓存优先只用于真正不可变的资源：icons / sounds / 版本化 CDN 字体。
   副产品：解决了测试套件复用持久 Chrome profile 会被旧缓存污染的隐患 ——
   合并后全量 14/14 全绿即是证据。
2. **图标从零造，零依赖可复现。** 仓库原本没有任何 png/svg/ico，也不能引
   PIL/sharp（无构建链）→ `tools/generate-icons.py` 用纯标准库做数学形状光栅化 +
   手写 PNG（zlib/struct，SS=4 超采样抗锯齿），生成 192 / 512 any + 512 maskable
   三个图标（铃铛剪影 + `--accent → --accent-deep` 渐变底，颜色取自 index.css 令牌）。
   重跑该脚本即可逐字节复现。
3. **路径全部相对。** 任务卡 IMPLEMENTATION 写 `register('/sw.js')`，但线上是
   GitHub Pages 子路径部署（`/call-me-mvp/`），绝对路径会 404；
   manifest 的 start_url/scope、注册路径、预缓存清单全部用相对路径，
   本地根路径服务器与线上子路径下行为一致。

自验结果：

| 验收项                         | 结果                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `node tools/run-all.mjs`       | **14/14 PASS，787 断言 0 失败**（S5 新增套件 46 断言）     |
| `eslint .`                     | exit 0，0 error                                            |
| `prettier --check`（改动文件） | exit 0（`.py` 无 prettier 解析器，属预期；目录扫描会跳过） |
| `check-worktree`               | 未发现被删除的已跟踪文件                                   |
| DevTools 等效验证              | `pwa.mjs` 已自动化：manifest 校验 / SW 注册激活 / 离线加载 |

AC 逐条对照：manifest 存在且字段达标（name/display/start_url/icons 192+512/
theme_color·background_color=令牌值）✓ / sw.js 注册且 activated、页面被控制 ✓ /
**离线可加载（停掉静态服务器 = 真实断网，首页/历史页/CSS 令牌/JS 模块全部来自缓存）** ✓ /
run-all 全绿 ✓ / eslint·prettier·check-worktree ✓。
补强项：预缓存清单从 sw.js 源码解析出来逐条验证文件存在与落地（防 addAll 整体失败）；
JSONBin 不写缓存（实时数据）；SW 更新策略 skipWaiting + clients.claim ✓。

**偏离任务卡 2 处（请主 AI 裁决）**：

1. AC 写「run-all 10/10（537 断言）」，实际 **14/14（787 断言）** —— S2/S3/S4/S5
   各新增一个回归套件并注册进 run-all，套件数 8 → 12，总项数 10 → 14。
2. 「静态资源缓存优先」改为「应用代码网络优先 + 缓存兜底」（理由见决策 1）；
   `register('/sw.js')` 改为相对路径 `./sw.js`（理由见决策 3）。

**已知边界（非缺陷，请主 AI 知悉）**：

- 离线时的 CDN 字体/图标 CSS 首次需联网成功后才进缓存（本地测试环境无外网，
  套件只验证同源资源离线可用；CDN 走「缓存优先 + 运行时缓存」策略）。
- 仓库 3 个 0 字节乱码未跟踪文件仍未处理（S4 已报告，待 Human 决定）。

## REVIEW RESULT

### R1：`docs/HANDOFF_14_ITEMS_2026-09-20.md`（14 项改动施工图）— **已核对，已裁决**

**结论：施工图可直接用。逐条抽查 15 处代码/测试断言，全部与真实源码吻合，未发现事实性错误。**

核对方式：只读评估（不建分支、不改代码），逐条比对文档声称的行号与真实文件内容。

| 组 | 抽查项 | 文档声称 | 实测 | 判定 |
| --- | --- | --- | --- | --- |
| C1 | `.btn` 是否有 CSS 定义 | 无（根因） | `index.css` 中 `.btn` 无任何定义（仅有 `.btn-text` 785/796、`.save-btn` 1029） | ✅ 根因成立 |
| C1 | `index.html:275` | `class="btn"` | 一致（`#resetButtons`） | ✅ |
| C1 | 顺序风险 `#saveProfile` | `class="btn save-btn"`，`.save-btn` 在后会覆盖 | `index.html:229` 一致；`.save-btn` 在 1029 | ✅ 风险真实 |
| B1 | `theme-entry.mjs:617-618` 硬断言旧主题名 | `气泡列表` / `按钮列表` | 逐字一致，**必须同步改** | ✅ 已改（commit 见下） |
| B2 | `index.html:112/118` 图标 | `fa-circle` / `fa-list` | 一致 | ✅ |
| B2 | `index.css:1238` 选择器 | 只匹配 `<i>` | `.more-item > i:first-child`，**换成 span 会失效** | ✅ |
| B3 | `index.css:1383` 容器上边距 | `margin-top: 76px` | 实测 **1382**（差 1 行，内容一致） | ✅ 内容对 |
| B3 | `index.css:1393` 头部下边距 | `margin-bottom: 20px` | 实测 **1392**（差 1 行） | ✅ 内容对 |
| F1 | `history.html` body class | 无 `history-page`（死规则） | `<body>`，`history.css:327/333` 确为死规则 | ✅ |
| F3 | `.history-toast` 无样式 | history.css 里没有 | 实测 **false**（确无）；`history.js` 自建该节点为 **true** | ✅ 双向证实 |
| E1 | 10 个 DOM 契约 id 存在性 | 全部保留 | 10/10 全部在 `index.html` | ✅ |
| A2 | `sounds/default-click.m4a` 存在 | 可复用 | 存在，9504 B | ✅ |
| C2 | 现状色组数 | 只有 `2n+1` / `2n` 两组 | 实测 381/386 两行，**必须整段替换** | ✅ |
| F1 | `body{display:flex;align-items:center}` | 根因 | `index.css:153/155` 一致 | ✅ |
| G1 | 现有 hover | 已有 `.more-item:hover` | 1234 存在，改的是配色 | ✅ |

**行号偏差**：仅 B3 两处差 1 行（76px 规则在 1382 非 1383、20px 在 1392 非 1393）。
内容全部正确，**施工时以内容定位、不要机械按行号跳转**。

**基线核对**：文档称 `npm test = 14 项 / 811 断言`。实测 `--skip-browser` = 2/2 PASS、
`lint` exit 0、`check-worktree` 缺失 0。差异说明：我的 `main = 9c00488` 已含
`tools/password-gate.mjs`（CM-010），14 项 / 811 断言与当前套件清单一致
（29/51/52/97/87/107/54/60/40/77/110/46 + lint + check-worktree），**基线与文档相符**。

**施工顺序建议（按风险，非文档的字母序）**：

1. **先做只改 CSS 的 C1/B3/G1** —— 零 DOM 风险、可独立验证，最快拿到可见收益
2. **B1 命名** 必须与 `theme-entry.mjs:617-618` 同一次提交改，否则套件立刻红
3. **A1 iOS 解锁** 是真实功能缺陷（非视觉），但**无法在 headless 里验证**（无真实手势解锁语义）→ 需 Human 真机确认
4. **E1 动 DOM** 放最后，且必须跑全量（`receipt-lifecycle` 54 项钉着 `#receiptStatus` 的 className/innerHTML）
5. **C3 若选滚动容器方案** ⇒ 单独 commit + 全量，因为会影响 `components.mjs` 的 CDP 真实坐标命中

**Human 已拍板（2026-09-20 21:44）**：

1. **G1 圆角** → 以施工图为准（底两角 16px）；`DESIGN_THEME_SWITCH.md:32` 已由主 AI 同步。
2. **派发施工** → **已派发给外部 AI，并授权其自行验收 + 合并 main + push**（见 CURRENT TASK）。

**范围外发现（只报告未修）**：

- 仓库根有 **3 个 0 字节乱码未跟踪文件**：`本地仓库`、`来源：直接抓取线上`、`（非文本提取，含真实`
  —— 是历次 shell 重定向被 MSYS 拆词后的残渣（同样问题在 S4/S5 报告里已记过一次，**至今未清**）。
  它们会被 `git status` 反复列出，建议 Human 确认后删除（我不擅自动手删文件）。
- `docs/HANDOFF_14_ITEMS_2026-09-20.md` 本身**尚未入库**（untracked）。

---

**5 项决策已拍板**（2026-09-20）。详见 CURRENT TASK。

**路线图**：S1 令牌化 → S2 主题层 → S3 切换入口 → S4 组件化 → S5 PWA（**全部已完成**）。

历史验收记录见归档目录 `docs/handoff/archive/`。

## NEXT ACTION

外部 AI 请按以下流程执行 **UI-14**（14 项改动）：

1. 读 `docs/HANDOFF_14_ITEMS_2026-09-20.md`（施工图，含设计稿精确取数 —— 不需要开 Ardis 画布）
2. 读本文件 `## CURRENT TASK` 的 SCOPE / NON-GOALS / ACCEPTANCE CRITERIA
3. 从 main 创建 `codex/ui-14`（`git rev-parse --short HEAD` 确认基线；
   建分支后**立即** `node tools/check-worktree.mjs`）
4. 按建议顺序施工：**C1/B3/G1（纯 CSS） → B1+golden 断言 → B2/C2/B4 → A 组 → F 组 → E1（最后）**
5. 每个 bug 修复做**反向验证**（把 bug 放回去确认断言 FAIL）
6. `node tools/run-all.mjs` 全量（基线 14 项 / 811 断言，**0 失败**）
7. `eslint .` + `prettier --check` 改动文件 + `git diff --check` + `check-worktree`
8. **Human 已授权自行验收**：通过后 `git checkout main && git merge --ff-only codex/ui-14`
   （切 main 若触发级联，守卫会自动恢复；合并后立即跑 `check-worktree.mjs`）
9. push：`git -c http.version=HTTP/1.1 -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main`
   （**必须在 Bash 工具里跑** —— PowerShell 下会 `cannot spawn sh`）
10. 回填本文件的 `EXECUTION STATUS` / `EXECUTION REPORT`（14 条逐条给证据 +
    明确列出未验证 / 有偏离的条目）

**基线与已知项**：

- `main = 9c00488`；lint exit 0；check-worktree 缺失 0
- `A1`（iOS 音频解锁）**headless 无法验证** → 必须显式声明"需真机确认"
- 施工图 B3 两处行号偏 1（内容无误），**按内容定位**
- `docs/DESIGN_THEME_SWITCH.md:32` 已改（G1 裁决落地），施工时勿再回改
