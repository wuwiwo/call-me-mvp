# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

CM-007 — 补历史页语言初始化与多语言清除反馈

PHASE: UX Consistency / BugFix
PRIORITY: P2

OBJECTIVE:

让 `history.html` 使用与首页相同的语言设置和翻译系统，历史页标题、返回/清除控件、空状态、错误 Webhook 文案和清除成功反馈随当前语言显示，并保持历史数据渲染与清除行为不变。

CONTEXT:

`history.html` 当前只直接初始化 `history.js`，没有初始化 `language.js`；页面标题、返回/清除按钮标题、顶部标题和 `history.clear()` 的 toast 仍写死为中文。`history.js` 已通过 `utils.getTranslation('history.empty')` 使用部分翻译，但历史页没有统一语言初始化入口。

SCOPE:

- `history.html`
- `js/modules/history.js`
- `js/modules/language.js`（如为安全复用语言初始化所必需）
- `js/modules/translations.js`
- 必要的历史页零依赖回归脚本、测试说明和本通信文档

NON-GOALS:

- 不改变历史记录 LocalStorage 格式、排序、状态 class、XSS 防护或清除数据语义。
- 不重做首页语言下拉菜单，不新增语言种类，不修改无关模块文案。
- 不引入框架、构建步骤或新的运行时依赖。
- 不顺手修复格式化基线、回执、cooldown 或其他路线图任务。

IMPLEMENTATION REQUIREMENTS:

1. 历史页加载时读取既有 `appLanguage`；缺失或不支持时沿用现有语言回退规则。
2. 复用现有 `TRANSLATIONS` / `utils.getTranslation` 体系，不建立第二份语言状态或重复翻译表。
3. 至少覆盖历史页文档标题、顶部标题、返回按钮 title、清除按钮 title、空状态、错误 Webhook 标签和清除成功 toast；翻译键命名保持可读且四种现有语言完整。
4. `history.html` 在有记录、无记录、清除后和非法/未知历史字段场景均不抛异常；清除后仍移除 `notificationHistory` 并重新渲染空状态。
5. 若 `language.init()` 需要扩展为支持历史页的部分 DOM，必须保持首页初始化行为不变，避免访问不存在的元素。
6. 用户可控历史字段继续通过安全 DOM API 渲染；不得恢复动态 HTML 注入路径。

ACCEPTANCE CRITERIA:

- [ ] `appLanguage=zh/en/ja/ko` 时历史页所有指定静态文案和反馈均显示对应语言。
- [ ] 未设置或非法语言时使用既有默认语言，不阻断历史页加载。
- [ ] 历史记录、空状态、错误 Webhook 行和清除动作在四种语言下均正常。
- [ ] 清除按钮只清除 `notificationHistory`，不会改动其他 LocalStorage 数据。
- [ ] CM-002/003/004/005/006 行为不回归，历史输入安全仍通过。
- [ ] 新增历史页语言回归脚本可复跑，记录准确断言数、环境、退出码和失败项。
- [ ] `node tools/check-worktree.mjs`、`npm run lint`、`git diff --check` 通过，且修改范围受控。

VERIFICATION:

1. 运行任务新增的历史页语言回归脚本，覆盖四种语言、默认回退、空状态、记录渲染、错误状态和清除 toast。
2. 运行 `node tools/check-worktree.mjs`，确认没有已跟踪文件缺失。
3. 运行已有 `tools/input-safety.mjs`、`tools/cooldown.mjs`、`tools/button-ids.mjs`、`tools/storage-resilience.mjs` 和 `tools/e2e.mjs`。
4. 运行 `npm run lint`、`git diff --check`，检查完整 diff 和实际修改范围。

BRANCH:

从本地 `main` 的**当前最新稳定 HEAD** 创建并使用：`codex/cm007-history-language`。外部 AI 开工前必须用 `git rev-parse --short HEAD` 确认（截至本任务卡定稿为 `913e9d1`；若其后仅有 docs-only 提交，直接用最新 HEAD）。

基线说明：参考代码基线为 `f268430`（CM-006 合并复验后的 main）；`c9dce0e` 之后所有提交均为 docs-only（任务派发、授权规则、任务卡维护），无代码差异，不影响本任务。

## EXECUTION STATUS

```text
状态：READY_FOR_REVIEW — CM-007 已实施完成并通过本地验证，等待主 AI 独立验收
任务分支：codex/cm007-history-language
任务基线：1bedcab（实测 HEAD；任务卡记 913e9d1，其后仅 docs-only 提交，代码等价）
当前工作分支：codex/cm007-history-language
main：未被修改（本任务全部提交都在任务分支上）
工作区：干净；tools/check-worktree.mjs 退出码 0；已跟踪文件缺失 0

本任务提交：
  00f0af3  fix: 历史页复用语言初始化并按当前语言渲染文案
  843a45c  test: 新增历史页语言回归与反向验证
  9e62898  docs: 登记 CM-007 验证工具与历史页语言说明
  （另有 1 个面板回填提交，见 git log）
```

## EXECUTION REPORT

> 报告不等于主 AI 验收通过。以下命令与输出均为本机实跑结果，可直接复跑复核。

### 一、修改文件

| 文件 | 改动 |
|---|---|
| `history.html` | 顶部标题加 `id="historyTitle"` 并传入 `history.init`；保留中文默认值作为脚本执行前的回退 |
| `js/modules/history.js` | `init()` 调用 `language.init()`；新增 `applyPageTexts()`；错误 Webhook 标签与清除 toast 改走 `utils.getTranslation()` |
| `js/modules/language.js` | `init(domElements = {})` 与各方法增加**元素存在性判断**（首页行为不变） |
| `js/modules/translations.js` | `history` 段新增 5 个键 × 4 语言 |
| `tools/history-language.mjs` | **新增**：CM-007 回归脚本（107 项断言） |
| `tools/negative-history-language.mjs` | **新增**：反向验证脚本 |
| `tools/README.md` | 登记两个新工具 + CM-007 环境变量/验收路径/兼容约束 |

### 二、实现摘要

**复用首页的语言初始化，不新建语言状态。**

| 关注点 | 实现 |
|---|---|
| 语言来源 | `history.js` 的 `init()` 调用 `language.init()` —— 读取 `appLanguage`、校验是否受支持、落到 `state.currentLang`（与首页同一个状态） |
| 查找翻译 | 沿用 `utils.getTranslation()`（读的正是那份 `state.currentLang`），不建第二张表 |
| 页面文案 | `applyPageTexts()` 写文档标题 / 顶部标题 / 返回 title / 清除 title；空状态与 Webhook 标签在 `render()`、toast 在 `clear()` |

**`language.js` 为什么必须改**：历史页没有语言切换控件，而 `bindEvents()` 会注册一个
全局 `document` click 监听去调用 `hideLanguageMenu()`。改动前 `hideLanguageMenu()`
无条件访问 `this.elements.languageMenu.classList` → 在历史页上**任意点击都会抛 TypeError**。
同理 `updateUserInfo()` 无条件访问 `userNameEl`。因此加了存在性判断；
首页传入的元素齐全，走的是原有分支，行为不变（T9 已覆盖验证）。

**新增翻译键**（四语言齐全，`tools/README.md` 中有取值表）。

### 三、测试结果（全部实跑）

**1) CM-007 回归（新增）**

```text
node tools/history-language.mjs
→ 断言：107 passed, 0 failed      退出码 0
  环境：Chrome/153.0.8010.50（headless，CDP 9448，HTTP 8899）
  T1/T2 翻译表完整性与四语言差异 · T3 四语言静态文案 · T4 空状态
  T5 记录渲染 · T6 语言回退 · T7 清除动作与数据范围 · T8 历史输入安全
  T9 首页不回归（含语言菜单可开可关）· T10 页面异常
  页面错误 0 条
```

**2) CM-007 反向验证（新增）**

```text
node tools/negative-history-language.mjs
→ 已支持版本：107 passed / 0 failed，退出码 0
  回退版本  ： 65 passed / 42 failed，退出码 1
  源码已还原：true（finally 中逐文件比对磁盘与备份，一致）
  结果：通过 —— 对「页面文案未随语言变化」与「翻译表缺键」均有区分力
```

回退版关键证据（暴露改动前的真实表现）：

```text
FAIL  en: 文档标题 = undefined -> "通知历史"                      ← 英文下标签页标题是中文
FAIL  en: 返回按钮 title = undefined -> "返回"
FAIL  en: 清除按钮 title = undefined -> "清除记录"
FAIL  en: 错误行标签 = undefined -> "Webhook: https://..."        ← 硬编码前缀
FAIL  zh.history 六个键齐全且非空 -> 缺: pageTitle,backTitle,clearTitle,cleared,webhookLabel
FAIL  pageTitle 四语言取值互不相同 -> [null,null,null,null]
```

**3) 非回归（既有套件）**

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/input-safety.mjs` | 97 passed / 0 failed | 0 |
| `node tools/cooldown.mjs` | 87 passed / 0 failed | 0 |
| `node tools/button-ids.mjs` | 52 passed / 0 failed | 0 |
| `CM003_CDP_PORT=19445 node tools/storage-resilience.mjs` | 51 passed / 0 failed | 0 |
| `node tools/e2e.mjs` | 29 passed / 0 failed | 0 |

> ⚠️ **`storage-resilience.mjs` 的端口说明（必须记录）**：按默认命令运行它**首次失败**，
> 报 `CDP 未就绪：Chrome 是否启动？端口 9445`。排查结论是**环境问题，与本次改动无关**：
> `netstat` 显示 `TCP 192.168.31.85:9445 → 183.232.74.27:41021 ESTABLISHED (PID 9936)`
> —— 9445 落在 Windows 动态端口范围内，被本机另一个进程的**对外连接占为源端口**，
> Chrome 无法监听。用脚本支持的 `CM003_CDP_PORT=19445`（已确认空闲）重跑即 51/51 通过。
> 上面表格里记录的是**实际执行的命令**。

**4) 其他检查**

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/check-worktree.mjs` | 未发现被删除的已跟踪文件 | 0 |
| `git diff --check` | 无空白错误 | 0 |
| `node node_modules/eslint/bin/eslint.js .` | **0 error / 1 warning**（见已知问题） | 0 |

> lint 用真实入口而非 `npm run lint`：本机 `node_modules/.bin/*` 是 POSIX shim，
> 依赖 `dirname`，在本机必然失败。与 CM-003 / CM-006 报告的记录一致。

### 四、已知问题与范围外发现（**未擅自修复**）

1. **一条跨任务兼容约束：`zh.webhookLabel` 必须保持 `Webhook`。**
   需求要求「错误 Webhook 标签」随语言变化。我最初把 zh 定为「Webhook 地址」，
   结果 **CM-005 的 `input-safety.mjs` 被打红 1 条**：
   `tools/input-safety.mjs:1024` 的断言是
   `f.err === \`Webhook: ${P.attrBreak}\`` —— 它把改动前硬编码的 `Webhook: ` 前缀
   钉进了期望字符串。`input-safety.mjs` **不在本任务 SCOPE 内**，按 AGENTS.md
   不擅自修改其他任务的验证资产，故改为：**zh 保持 `Webhook`**（对外文案与改动前一致），
   en/ja/ko 给出各自自然的标签（`Webhook URL` / `Webhook URL` / `Webhook 주소`）。
   该约束已写成 `history-language.mjs` 里的显式断言，避免以后被静默改坏。
   **若主 AI 希望 zh 也改成更具体的说法**（如「Webhook 地址」），
   需同时更新 `input-safety.mjs:1024` 的期望值 —— 那是另一次改动，请指派。

2. **历史页静态文案在 HTML 中保留了中文默认值。**
   它们由 `history.js` 在 `init()` 时按当前语言覆盖；保留默认值是为了在脚本执行前
   与执行失败时有可读内容 —— 与 `index.html` 对 `title` / `subtitle` 的既有做法一致。
   若主 AI 更希望 HTML 里完全不出现中文（例如改用空元素 + 必填），请指明。

3. **`tools/cooldown.mjs`（CM-006）的 CDP 默认端口 9446 与 CM-004 重复。**
   `tools/README.md` 记录 CM-004 = 9446、CM-006 = 9446（我上轮引入的重复）。
   因两者 HTTP 端口同为 8899、本来就只能串行，实际未出问题，但这是**潜在碰撞**
   （本次排查端口时顺带发现）。属 CM-006 范围，**本任务未改**；建议单独一次提交
   把其中一个改成空闲端口（并把 9445 这类落在动态端口范围内的默认值一并评估）。

4. **`tools/worktree-guard.mjs:117` 的 lint warning** 仍在（`catch (e)` 的 `e` 未使用），
   与 CM-006 报告一致。该文件属 GOV-001 防线，非本任务引入，**未修**。

5. **审计文档的过时描述**（未修改，属主 AI 的审计基线）：
   - `docs/TECH_DEBT.md:59-66` CM-001-TD-06 —— **已解决**，可考虑标记关闭
   - `docs/DATA_FLOW.md:94` 「历史页没有加载语言模块，因此保存的 `appLanguage`
     不会在该页面初始化到 `state.currentLang`」—— **已不成立**
   - `docs/ARCHITECTURE.md` 中关于 `history.html` 只加载 `history.js` 的描述 —— 已变化
   - `AGENTS.md` 的「已知高风险区域」里 `history.html` 一条（「当前只加载 `history.js`，
     没有初始化首页的 `language.js`」）—— 已变化

### 五、未执行的验证

- 未做真实浏览器的手动交互验证（语言切换后跳转历史页的场景）——
  历史页没有语言切换控件，正常路径是"在首页切换 → 跳转历史页"；
  本脚本通过直接预置 `appLanguage` 后加载 `history.html` 覆盖了该状态。
- 未验证 `history.html` 的 `<html lang>` 属性随语言更新 —— 不在任务要求内，未改动。

## REVIEW RESULT

CM-006：PASS，已合并并完成合并后复验。

CM-007：尚未验收。

## NEXT ACTION

外部 AI 请读取最新的 `AGENTS.md` 和本文件，确认实际 `HEAD` 后创建 `codex/cm007-history-language`，按 `CURRENT TASK` 执行。完成后更新本文件的 `EXECUTION STATUS` 和 `EXECUTION REPORT`，等待主 AI 独立验收。不要修改或合并 `main`。
