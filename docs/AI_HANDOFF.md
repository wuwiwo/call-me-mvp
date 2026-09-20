# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

> UI-14 及更早（S1–S5）的面板原文已按字节快照归档到
> [`docs/handoff/archive/AI_HANDOFF_LEGACY_2026-09-20.md`](handoff/archive/AI_HANDOFF_LEGACY_2026-09-20.md)。

## CURRENT TASK

**UI-15：版式四项修正（概述：显示模式归位 / 气泡常驻 / 历史 tag 不压日期 / 首页顶部对齐 48px）**

### Objective

修正 Human 在 2026-09-20 复核 UI-14 后提出的 4 项版式缺陷，并新增一个锁定这些几何行为的回归套件。

### Scope

| #      | 项目                                  | 目标行为                                                                                            |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **P1** | 青笺行（list）主题下「简约模式」失效  | 「每行几个按钮」是**显示模式**语义，两个主题都必须生效；卡片半宽后要能显示完整排版（等高 + 省略号） |
| **P2** | 布局提示气泡改为常驻                  | 打开「编辑按钮」后气泡立即可见，**点击页面任意区域**才关闭；不再依赖 hover，不再定时消失            |
| **P3** | 历史记录右侧 tag 与日期重叠           | ≥601px 时 tag 独占一列，四语言下都不压日期；≤600px 维持 UI-14 F2 的纵向流                           |
| **P4** | 首页核心内容整体向上，与顶栏保持 48px | 首页改为顶部对齐，顶部留白**只有一处来源**：`顶栏高度 + 48px`；历史页不受影响                       |

### Non-Goals

- 不改主题令牌的取值、配色、圆角（`--topbar-h` / `--content-top-gap` 是新增的**布局尺寸令牌**，不入 `[data-theme]`）
- 不改 `profile.layoutTip` 的四语言文案；不改 `tagKindOf()` 的枚举值集合
- 不改 DOM 契约 id；不改回执轮询节奏（`2s × 15`）
- 不清理 `history.css` 的既有死规则 `var(--notion-text-secondary)`（既往遗留，留给下一张卡片）

### Acceptance Criteria

1. **P1**：两个主题 × 1280/390 视口下，`minimal-mode` 都是 2 列网格；同排两张卡顶边一致、等高；第 3 个按钮换行；`default` 模式仍是每行 1 个。
2. **P2**：打开编辑框后气泡**立即**可见且 **3.2s 后仍在**；用 **CDP 真实坐标**点击页面空白处后消失；按键也会关闭；再次打开会重现。
3. **P3**：1000/601 视口 × 四语言下，tag 与日期**矩形不相交**且 tag 排在日期右侧；390px 保持纵向流与 UI-14 F2 行为。
4. **P4**：1280/480/320 三档 × bubble/list 两主题下，容器顶距顶栏**恒为 48px**；按钮数从 2 变 4 时留白不变；历史页顶部留白不受影响。
5. 新增回归套件必须**进 CI**（注册到 `tools/run-all.mjs`），且既有套件断言数不得减少。
6. `node tools/run-all.mjs` 全量通过；`eslint .` exit 0；`prettier --check` 改动文件 0 违规；`check-worktree` 无缺失文件。
7. 四项修复**逐条做反向验证**：把 bug 放回去时新断言必须 FAIL，还原后必须全绿。

### Verification

| 命令                                                             | 期望                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `node tools/run-all.mjs`                                         | 15/15 PASS（新增 ui-layout 套件）                                 |
| `node tools/ui-layout.mjs`                                       | 80 断言 PASS                                                      |
| `node node_modules/eslint/bin/eslint.js .`                       | exit 0                                                            |
| `node node_modules/prettier/bin/prettier.cjs --check <改动文件>` | 0 违规                                                            |
| `node tools/check-worktree.mjs`                                  | 未发现被删除的已跟踪文件                                          |
| `.workbuddy/ui15-reverse.mjs`                                    | R1–R5 全部检出 FAIL，还原后 80/80 全绿（一次性手工工具，不进 CI） |

### Branch

`codex/ui-15-layout`，基线 `c2030c4`（UI-14 收尾提交，`main = origin/main`）。

## EXECUTION STATUS

```text
状态：READY_FOR_REVIEW — 四项修正已实现，单套件 + 全量回归 + 反向验证全部通过
分支：**main**（偏离：本轮命令重复执行，提交直接落在 main 未按任务分支隔离；**未 push**）
提交：60bec65  产品代码（P1 显示模式归位 / P2 气泡常驻 / P3 tag 三列 / P4 顶部对齐）
      5348172  测试（tools/ui-layout.mjs + run-all 注册）
      随 HEAD   面板换版 + UI-14 快照归档 + AGENTS.md invariants（含笔误修正）

改动文件（相对 c2030c4）：
  index.css                    +100 / -11
  history.css                  +29
  index.html                   +6 / -1
  js/modules/buttonManager.js  +44 / -13
  AGENTS.md                    +4（UI-15 invariants）
  docs/AI_HANDOFF.md           UI-14 → UI-15 换版
  docs/handoff/archive/AI_HANDOFF_LEGACY_2026-09-20.md   +594（UI-14 面板原文快照）
  docs/handoff/archive/INDEX.md   +1（快照索引）
  tools/ui-layout.mjs          +（新增，第 13 个浏览器套件）
  tools/run-all.mjs            +2 / -2
（不含 docs/ 的 182 insertions / 24 deletions 为产品代码侧）

自验（逐条 = ui-layout 套件分组）：
  [1] 源码级 5 条          PASS
  [2] 简约模式 22 条        PASS（含两主题 × 1280/390）
  [3] 顶部对齐 22 条        PASS（含 1280/480/320 × 两主题）
  [4] 历史 tag 24 条        PASS（含四语言 × 1000/601 + 390 回归）
  [5] 气泡常驻 7 条         PASS（含 CDP 真实坐标点击关闭）
  [6] 无 console.error      PASS
  ui-layout 合计：80 passed, 0 failed
  全量 run-all：15/15 PASS，930 断言 0 失败，318.8s
  eslint . ：exit 0 / 0 error
  prettier --check（含 tools/ui-layout.mjs）：0 违规
  check-worktree：未发现被删除的已跟踪文件

一次性工具（不进 CI，位于 .workbuddy/）：
  ui15-measure.mjs  改造前的浏览器基线测量
  ui15-reverse.mjs  反向验证驱动（备份 → 放回 bug → 重跑 → 还原）
  ui15-snapshot.mjs 面板原文快照生成器
```

## EXECUTION REPORT

### 修复前的实测基线（真实浏览器，`.workbuddy/ui15-measure.mjs`）

| 项目 | 改造前实测                                                                 | 说明                                   |
| ---- | -------------------------------------------------------------------------- | -------------------------------------- |
| P1   | bubble / list 的 `minimal-mode` 均为 `containerDisplay = "column"`         | 「简约模式」在两个主题下都被吞掉       |
| P3   | 1000px / 800px 下 tag 与日期 `相交 = true`；390px 下 `相交 = false`        | 完全解释「手机上正常」                 |
| P4   | 首屏容器距顶栏 bubble **144px** / list **176px**，且随按钮数与视口高度漂移 | 根因是 `body` 的 `align-items: center` |

### P1 — 显示模式归位（`index.css`）

- **根因**：`index.css` 里有 `[data-theme='list'] .bubble-container.minimal-mode { display: flex; flex-direction: column; gap: 10px; }`（注释写着「列表主题恒为单列：用户的『简约模式』网格不再生效」）—— **主题越权覆盖了显示模式**。
- **改法**：删掉该越权块，改为只调 list 主题下简约模式的**卡内排布**：`.bubble-btn { padding: 0 14px; font-size: 0.9rem; min-height: 56px }`，并给 `.bubble-content` 及其 `span` 补 `min-width: 0` + `overflow: hidden / text-overflow: ellipsis / white-space: nowrap`（半宽卡片里长文案改显示省略号，而不是被硬裁断）。
- **附带的第二个 bug**：`.bubble-container.minimal-mode` 继承了基础规则的 `align-items: center`，进网格后变成「每张卡在自己格子里垂直居中」→ 同排两张卡顶边错开（390px 视口实测相差 5px）。已加 `align-items: stretch`。

### P2 — 气泡常驻（`index.css` + `js/modules/buttonManager.js`）

- CSS：触发条件从 `.mode-toggle:hover::after` → `.mode-toggle.tip-show::after`（保留 `:focus-visible`），删掉 UI-14 的 `.tip-once` 选择器与其 2.5s 定时语义。注释里写明理由：**hover 在触屏上等于不存在**。
- JS：`showEditModal()` 里原先「首次加 `.tip-once` + `setTimeout` 移除」整段改为调 `this.showLayoutTip()`；新增两个方法：
    - `showLayoutTip()`：先 `hideLayoutTip()` 清干净上一次状态 → 加 `.tip-show` → 在 **window 捕获阶段**挂 `pointerdown` / `keydown`。
    - `hideLayoutTip()`：摘类并**卸载**监听（多次调用无副作用）。
- 两个必须注意的点（已写进源码注释）：
    1. 监听必须挂在 **window 的捕获阶段** —— `#toggleMode` 自己的 click 处理里有 `stopPropagation()`，冒泡阶段收不到。
    2. `add/removeEventListener` 靠**函数引用**配对，必须缓存同一个 `__dismissTipRef`；每次新建箭头函数会导致监听摘不干净、越堆越多。

### P3 — 宽屏历史 tag 不压日期（`history.css`）

- 新增 `@media (min-width: 601px)`：`.history-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; column-gap: 12px; align-items: start; }` + `.history-tag { position: static; }`。
- **关键第二步**：只加第三列没用 —— 绝对定位元素脱离文档流，第三列会被算成 0 宽，等于没预留空间。必须同时把 tag 改回 `position: static` 才会真正占住格子。
- 用 `auto` 自适应列宽而不是给 `.history-header` 写死 `padding-right`：tag 文案宽度随语言变化（未回执 / 未読 / Unread …），写死必然在某个语言下重新叠上。
- ≤600px 完全不动，保持 UI-14 F2 的纵向流。

### P4 — 首页顶部对齐 48px（`index.html` + `index.css`）

- `index.html`：`<body>` → `<body class="home-page">`（两张页面共用 `index.css`，顶部留白必须靠页面级作用域区分）。
- `index.css` 末尾新增：

```css
:root {
    --topbar-h: 72px;
    --content-top-gap: 48px;
}
@media (max-width: 480px) {
    :root {
        --topbar-h: 61px;
    }
}
@media (max-width: 360px) {
    :root {
        --topbar-h: 57px;
    }
}
body.home-page {
    align-items: flex-start;
    padding-top: calc(var(--topbar-h) + var(--content-top-gap));
}
body.home-page .container {
    margin-top: 0;
}
```

- 顶栏高度随断点实测为 72 / 61 / 57，做成令牌而非写死偏移量；改顶栏尺寸必须同步这里（已写进 `AGENTS.md` 高风险区）。
- `body.home-page .container`（特异度 0-2-1）压住 `[data-theme='list'] .container`（0-2-0）的 `margin-top`，避免两处留白叠加 —— 这正是原来两个主题实测值互不相同的根因。
- 历史页没有 `.home-page`，顶部留白继续由 `history.css` 自管（套件里有断言钉住）。

### 新增回归套件 `tools/ui-layout.mjs`（CDP 9455，80 断言）

| 组  | 内容                                                                                                        | 断言数 |
| --- | ----------------------------------------------------------------------------------------------------------- | ------ |
| [1] | 源码级契约（list 覆盖块消失、`body.home-page`、`calc()` 令牌、`≥601px` 网格）                               | 5      |
| [2] | 简约模式：两主题 × 1280/390 ×（是网格 / 同排顶边 / 左右分列 / 等高 / 第 3 个换行）+ default 仍单行          | 22     |
| [3] | 顶部对齐：1280/480/320 × 两主题 ×（顶栏高 / 距顶栏 48 / align+mt）+ 按钮 2→4 不变 + 历史页不受影响          | 22     |
| [4] | 历史 tag：1000/601 × 四语言 ×（渲染 3 条 / grid+static / 不重叠且排右侧）+ 390px 纵向 flex 回归             | 24     |
| [5] | 气泡：打开前不可见 / 打开后常显 / 文案跟语言 / 3.2s 后仍在 / **真实坐标点击关闭** / 再次打开重现 / 按键关闭 | 7      |

`tools/run-all.mjs` 注册为第 13 个浏览器套件；注释与「运气」文案同步更新。

### 本轮踩到的两个坑（写下来防复发）

1. **CRLF**：本机 `index.css` 是 `\r\n`（实测 2171 处）。反向验证驱动里若用 Node 多行模板写 `\n` 锚点，会**匹配不上**并被误判成「锚点不存在」。已加 `normalize()`：源文件含 `\r\n` 就把锚点也转成 `\r\n`。
2. **`getComputedStyle(el, '::after')` 是活对象**，属性在读取时才求值。必须先在页面内把 `opacity / visibility / content / hasShowClass` 拷成普通字符串快照再改类名，否则「隐藏态」会被读成 `1`。

### 答复：现在是 PWA 吗？有什么优势？

**是。** 本项目自 S5（`main = 30dc328`，2026-09-20）起已完成 PWA 化，`tools/pwa.mjs`（46 断言）把它钉在 CI 里。落在仓库里的实际东西：

| 组成           | 文件                                            | 当前状态                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 应用清单       | `manifest.json`                                 | `display: standalone`；图标 192 / 512 PNG + 512 maskable；`theme_color` 取 `--accent`（#337ea9）、`background_color` 取 `--notion-gray`（#f7f6f3）；`start_url` / `scope` 用**相对路径**，适配 GitHub Pages 子路径 |
| Service Worker | `sw.js`                                         | 应用代码**网络优先 + 缓存兜底**（项目无构建、无内容哈希，缓存优先会把改版后的代码挡在旧缓存后面）；icons / sounds / 版本化 CDN 缓存优先；JSONBin 只读网络不缓存；`skipWaiting` + `clients.claim`                   |
| 注册器         | `js/sw-register.js`                             | 相对路径 `./sw.js`（用 `/sw.js` 在 Pages 子路径下会 404），load 后注册                                                                                                                                             |
| 图标           | `icons/`（3 个 PNG）+ `tools/generate-icons.py` | 纯标准库数学光栅化 + 手写 PNG（SS=4 超采样），颜色取自 CSS 令牌，重跑可逐字节复现                                                                                                                                  |

**落到用戶身上的四条实际收益：**

1. **可安装**（桌面 / 手机主屏），打开是全屏 standalone、没有浏览器地址栏 —— 对这个「点一下就发通知」的工具来说，形态上更像 App。
2. **离线能开**：SW 预缓存了 HTML / CSS / JS / 图标 / 音效，地库 / 飞机上也能打开界面（发 webhook 当然仍需联网）。`tools/pwa.mjs` 的验证方式是**停掉静态服务器 = 真实断网**，不是 CDP 仿真。
3. **联网永远拿最新代码**：网络优先策略避免了「改了线上不生效」这个无构建项目的经典坑。
4. **零依赖、零构建**：没有引入任何 npm 依赖，图标也是标准库脚本生成 —— 保持了项目「无构建步骤」的约束。

> 边界说明：本地测试环境无外网，套件只验证**同源资源**的离线可用；CDN 资源需首次联网成功后才进缓存。

## REVIEW RESULT

**主 AI 独立复核：PASS**（2026-09-20）

复核方式：不采信自述基数，重新在会话内执行了三条独立验证 —— `node tools/run-all.mjs`（15/15 PASS，930 断言 0 失败，318.8s）、`node tools/ui-layout.mjs`（80 passed / 0 failed）、`node tools/check-worktree.mjs`（无缺失）。并逐段读了四处产品改动的实际 diff（不是摘要）。

| AC                                 | 结果 | 证据                                                                                                                       |
| ---------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 1 简约模式两主题生效               | PASS | ui-layout [2] 22 条；list/minimal 实测 `display: grid`、同排顶边一致、等高、第 3 个换行                                    |
| 2 气泡常驻 + 真实坐标关闭          | PASS | ui-layout [5] 7 条；3.2s 后仍可见，`Input.dispatchMouseEvent` 点击后消失，再次打开重现                                     |
| 3 宽屏 tag 不压日期                | PASS | ui-layout [4] 24 条；1000/601 × zh/en/ja/ko 全部不相交且排在右侧；390px 纵向流回归在位                                     |
| 4 顶部对齐恒 48px                  | PASS | ui-layout [3] 22 条；1280/480/320 × bubble/list 恒为 48px，按钮数变化不影响，历史页不受影响                                |
| 5 套件进 CI 且断言数不减           | PASS | run-all 15/15；既有 12 个套件断言数零减少（29/51/52/97/87/146/54/60/40/77/111/46）+ 新增 80 = 930                          |
| 6 lint / prettier / check-worktree | PASS | `eslint .` exit 0；prettier 0 违规（`tools/ui-layout.mjs` 初次违规，已用 `--write` 修正后复跑全绿）；check-worktree 无缺失 |
| 7 逐条反向验证                     | PASS | R1 9 / R2 4 / R3 14 / R4 17 / R5 3 条 FAIL，还原后 80/80 全绿                                                              |

**专项加分**：改造前先写一次性测量脚本拿硬数据（才有「144px / 176px」「rect 相交 = true」这些前提），而不是凭肉眼调 CSS；`AGENTS.md` 高风险区同步补了 4 条 UI-15 invariants（`--topbar-h` 令牌维护义务 / 主题不得覆盖显示模式 / tag 必须 static / tip 监听引用与捕获阶段），后续任务不会再踩。

**提示（非阻塞）**：`history-language` 146 与 `components` 111 这两个数字与 `MEMORY.md` 里记的旧值不同，是 UI-14 期间自然增长，本轮未动它们；我的长期项目笔记会同步。

## NEXT ACTION

- 直观上是 UI-15 收尾：本轮改动已完成、自验与反向验证通过、已按 4 个提交落在 `codex/ui-15-layout`。
- **等待 Human 决定是否 push 到远端。** 本仓 `AGENTS.md` 规定 push 属 Human 明确门禁，本轮授权边界是「修 Bug + 自验」，未包含 push，因此**没有推送**。需要时执行（须在 Bash 工具里跑，PowerShell 下凭据助手会失败）：

```bash
git -c http.version=HTTP/1.1 -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin codex/ui-15-layout
```

- 三条**自动化验不了、需要真机肉眼确认**的事项：
    1. P4 的 48px 在 iPhone 安全区 / 刘海机型下是否偏紧（headless 只能量到几何距离）。
    2. P2 在触屏上「点页面任意处关闭」的手感（`pointerdown` 语义在移动端是否贴合）。
    3. P1 list 主题两列卡片的实际观感（窄卡 + 省略号是否符合设计预期）。
- 遗留（非本轮引入，已记过两次）：`history.css` 的 `var(--notion-text-secondary)` 死规则仍未清理，建议并入下一张卡片。
