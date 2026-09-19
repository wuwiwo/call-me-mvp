# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

CM-010 — password/access gate 威胁模型、重复定义收敛与诚实文案

PHASE: Security / Docs / BugFix
PRIORITY: P3

OBJECTIVE:

给密码门建立**书面威胁模型**，让代码、文案、文档三者表述一致且诚实：它是 **UI 级访问提示**，
不是安全边界。同时收敛 `config.js` 与 `password.js` 的密码配置重复定义（单一来源），
把用户可见文案改为与实际防护能力相符的诚实表述（四语言）。

**威胁模型已由主 AI 按路线图拍板（本任务不再需要 Human 中途决策）**：

- 资产：无真正受保护资产 —— webhook URL、密码本身对任何能打开页面的人都可见（源码 / DevTools / LocalStorage）。
- 对手：能打开页面的任何人。绕过成本 ≈ 0（读源码或清 LocalStorage 即可）。
- 结论：密码门只能挡「完全不懂技术的随手访问者/防误触」，**不删除功能**（保留现状行为），
  但任何文案与文档不得声称或暗示「保护 / 安全 / 加密 / 授权」。
- `expiryDays = 7` 的语义：本地时间戳比较，清空 LocalStorage 即重置，不是服务器端有效期。

CONTEXT:

- `js/modules/config.js:24-27` 定义了 `password.defaultPassword: "666888"` 与 `expiryDays: 7`；
  `js/modules/password.js:7,11` 又各自硬编码 `'666888'` 与 `PASSWORD_EXPIRY_DAYS = 7`，
  **两处独立维护、password.js 从不读 config**（AGENTS.md「密码配置存在重复定义」即指此）。
- `password.js` 的提示文案「密码每周更新，请联系管理员获取最新密码」暗示了一个不存在的
  管理机制 —— 实际上没有任何「每周更新」，密码就是源码里的常量。
- LocalStorage key：`accessPassword`、`passwordSetTime`（**保持名称与格式不变**，数据兼容）。
- `docs/TECH_DEBT.md` 与 `AGENTS.md` 安全边界段已有「密码模块只能是 UI 级访问提示」的原则性描述，
  本任务把它落成具体威胁模型文档，并让文案与之对齐。

SCOPE:

- `js/modules/password.js`：从 `CONFIG.password` 读取 `defaultPassword` / `expiryDays`，删除模块内硬编码重复（`correctPassword`、`PASSWORD_EXPIRY_DAYS`）；LocalStorage key 常量保留在本模块。
- `js/modules/config.js`：保持为密码配置的**唯一来源**（字段名不变）。
- `js/modules/language.js`：文案四语言（zh/en/ja/ko）。`password.hint` 改为诚实表述，语义参考：「这只是防误触的访问提示，不是安全保护——任何能打开本页的人都可以绕过」。其余键（title/label/placeholder/verifyBtn/errorEmpty/errorWrong）保持现状；如确有暗示安全性的措辞一并修正。
- `docs/SECURITY.md`（**新增**）：威胁模型小节（资产 / 对手 / 结论 / 有效期语义 / 为什么不做成"真"校验——纯前端无秘密可言）。
- `tools/password-gate.mjs`（**新增**，CDP 端口 **9450**，HTTP 8899 串行）：本任务回归套件。
- `tools/negative-password-gate.mjs`（**新增**）：反向验证（回退 password.js/config.js 必须失败且命中修复点关键字；`CM010_BASE_REF` 指定基线，**注意 CM-008 教训：改造合并进 main 后须显式指定改造前 commit**）。
- `tools/run-all.mjs`：套件清单登记新套件（lint + 8 套件 + check-worktree）。
- `tools/README.md`：登记新工具与端口。
- 本通信文档与归档。

NON-GOALS:

- 不删除密码功能、不改触发时机（过期才弹）与交互行为。
- 不引入 hash、加密、混淆、服务端校验或任何"让它看起来更安全"的手段 —— 纯前端没有秘密，伪装安全性比明文更有害。
- 不改 LocalStorage key 名与数据格式；不迁移旧数据。
- 不改 webhook 协议、`#receiptStatus`、冷却、语言回退规则。
- 不顺手修既有 lint warning、不处理 format 基线、不动 AGENTS.md（主 AI 自己同步）。

IMPLEMENTATION REQUIREMENTS:

1. `password.js` 不再出现字面量 `'666888'` 与硬编码 `7`（改从 `CONFIG.password` 读）；行为不变。
2. `verify()` 语义不变：`localStorage accessPassword` 优先，缺省回退默认密码。
3. 非法/损坏的 `passwordSetTime`（非数字、空串、NaN）按「已过期」处理（弹窗）——与现状 `parseInt` 行为对齐，不得因此抛异常阻断首页。
4. 新增/修改的翻译键**四语言齐全且取值互不相同**（沿用 CM-007 断言惯例）；改用户可见字符串前先 grep `tools/`，确认没有既有套件把该字面量钉进期望值。
5. 密码模态框由 `innerHTML` 拼装的现状**不在本任务重构**，但新增的文案不得引入注入面（翻译值是常量，不拼用户输入）。
6. 新回归套件覆盖：无时间戳→弹窗；7 天内→不弹；超 7 天→弹；非法时间戳→弹且不抛异常；默认密码可过、错密码报错、`setPassword` 覆盖生效、`clearPassword` 后回退默认密码；hint 文案为诚实表述（四语言）；源码级断言 password.js 无 `'666888'`/硬编码 7；页面异常 0。
7. 反向验证：回退版必须失败且失败项命中「单一来源」与「诚实文案」两类关键字。

ACCEPTANCE CRITERIA:

- [ ] 威胁模型写入 `docs/SECURITY.md`，结论与代码/文案一致。
- [ ] `grep 666888 js/` 只命中 `config.js` 一处；`password.js` 无硬编码密码与天数。
- [ ] hint 文案四语言均为诚实表述，无任何「安全/保护/加密/授权」类暗示。
- [ ] 新套件全绿；反向验证有区分力；既有 7 套件断言数不变（29/51/52/97/87/107/54）。
- [ ] `node tools/run-all.mjs` 全量通过（10 项：lint + 8 套件 + check-worktree）。
- [ ] lint 0 error、`git diff --check` 0、check-worktree 缺失 0；改动范围受控。

VERIFICATION:

1. `node tools/password-gate.mjs` 与 `node tools/negative-password-gate.mjs`。
2. `node tools/run-all.mjs` 全量。
3. `node node_modules/eslint/bin/eslint.js .`、`git diff --check`、`node tools/check-worktree.mjs`、完整 diff 范围核对。

BRANCH:

从本地 `main` 的**当前最新稳定 HEAD** 创建并使用：`codex/cm010-password-threat-model`。开工前必须 `git rev-parse --short HEAD` 实测（任务卡定稿基线 = 合并 CM-009 后主 AI 文档收尾提交；其后若有 docs-only 提交，直接用最新 HEAD）。

注意：本机存在「checkout/merge 触发工作区级联丢失」环境缺陷（详见 `docs/handoff/archive/WORKTREE-FILE-LOSS.md`、`CM-007.md`、`CM-009.md`）。**创建/切换分支后必须立即运行 `node tools/check-worktree.mjs`**；若已跟踪文件缺失，先确认非有意删除，再 `git restore -- <路径>` 恢复，不得把缺失当作删除提交。**验收前不得合并 main、不得 push**（CM-008 教训）。

## EXECUTION STATUS

```text
状态：READY_FOR_REVIEW — CM-010 已实施完成并通过本地验证，等待主 AI 独立验收
任务分支：codex/cm010-password-threat-model
任务基线：ab28b55（实测 HEAD）
当前工作分支：codex/cm010-password-threat-model
main：未被修改（本任务全部提交都在任务分支上）；本任务未 push
工作区：干净；check-worktree 缺失 0（建分支后立即复核，之后每次分支切换亦复核）

本任务提交（6 个）：
  6da3f6a  fix: 密码配置收敛到 CONFIG.password 单一来源
  1cffdfe  fix: 访问提示文案改为诚实表述（四语言）
  f097379  docs: 新增 docs/SECURITY.md 访问提示威胁模型
  4676a17  test: 新增 CM-010 访问提示回归与反向验证并登记入口
  2f9271b  docs: tools/README 登记 CM-010 工具与端口
  （另有 1 个套件计数修正提交）

★ 另有一个**独立授权分支**（不在本任务 SCOPE 内，Human 本轮另行要求）：
  codex/gov002-guard-outside-worktree —— 把工作区守卫移出 tools/
    ef85ff4  fix: 守卫移出 tools/ 并自安装到 .git/，钩子三级回退
    68616ce  docs: 更新守卫新位置与三级回退说明
  详见 EXECUTION REPORT 的「附：GOV-002 守卫修复」。
```

## EXECUTION REPORT

> 报告不等于主 AI 验收通过。以下命令与输出均为本机实跑结果，可直接复跑复核。

### 一、修改文件

| 文件 | 改动 |
|---|---|
| `js/modules/password.js` | 改从 `CONFIG.password` 读默认密码与有效期；删除硬编码密码 / `correctPassword` / `PASSWORD_EXPIRY_DAYS`；损坏时间戳按「已过期」处理 |
| `js/modules/config.js` | 标注为密码配置**唯一来源**（字段名与取值未变） |
| `js/modules/translations.js` | 四语言 `password.hint` 改为诚实表述 |
| `docs/SECURITY.md` | **新增**：访问提示威胁模型 |
| `tools/password-gate.mjs` | **新增**：回归套件（60 项断言，CDP 9450） |
| `tools/negative-password-gate.mjs` | **新增**：反向验证 |
| `tools/run-all.mjs` | 套件清单登记 password-gate（现 10 项） |
| `tools/README.md` | 登记新工具/端口 + CM-010 验收路径 |

### 二、实现摘要

**威胁模型已落成文档**（`docs/SECURITY.md`）：资产（无真正受保护资产）→ 对手（任何能打开页面的人，
绕过成本 ≈ 0）→ 结论（只防误触与不懂技术者，不防有意绕过）→ 有效期语义（本地时间戳，
清 LocalStorage 即重置）→ 为什么不做"真"校验（纯前端无秘密，伪装安全性比明文更有害，正确做法是改部署形态）。

**单一来源**：`password.js` 不再自带一份配置。新增 `defaultPassword()` / `expiryMs()`
两个读取函数，缺配置时退化为空串与 0 天（不抛异常、也不放行任意输入）。
LocalStorage key（`accessPassword` / `passwordSetTime`）名称与格式未变。

**诚实文案**：四语言 `hint` 重写为「这只是防误触的访问提示，任何能打开本页的人都能绕过它」。
其余键按要求保持现状。改动前已 `grep tools/` 确认无既有套件钉住这些文案。

**顺带修正一处「坏数据反而放行」**：原实现用 `parseInt` 结果直接比较，
`Date.now() - NaN > expiry` 恒为 `false` → 时间戳损坏时**永远不要求验证**。
现按「已过期」处理。

### 三、测试结果（全部实跑）

**1) 新增套件**

```text
node tools/password-gate.mjs
→ 断言：60 passed, 0 failed    退出码 0
  环境：Chrome/153.0.8010.50（headless，CDP 9450，HTTP 8899）
  S0 前置 · S1 触发语义 · S2 验证交互 · S3 模块语义 · S4 诚实文案 · S5 单一来源 · S6 页面异常
  页面错误 0 条
```

**2) 反向验证**

```text
node tools/negative-password-gate.mjs
→ 已改造版本：60 passed / 0 failed，退出码 0
  回退版本  ：43 passed / 17 failed，退出码 1
  源码已还原：true
  单一来源类失败 5 条 · 诚实文案类失败 8 条 · 损坏时间戳类失败 4 条
```

回退版关键证据：

```text
FAIL  password.js 不含默认密码字面量 -> 666888
FAIL  password.js 从 CONFIG.password 读取配置
FAIL  js/ 下默认密码字面量只命中 config.js 一处 -> ["config.js","password.js"]
FAIL  zh: hint 不声称"每周更新/联系管理员" -> 命中 ["每周","管理员","更新"]
FAIL  zh: hint 明确说明"能被绕过" -> 缺少 "绕过"
FAIL  时间戳损坏 "abc" → 弹窗 -> hasModal=false
```

**3) 统一入口全量**

```text
node tools/run-all.mjs
→ 模式：完整（10 项）；10/10 通过；合计 537 项断言，失败 0；222.4s；退出码 0
  lint 0 error/1 既有 warning · e2e 29/0 · storage-resilience 51/0 · button-ids 52/0
  input-safety 97/0 · cooldown 87/0 · history-language 107/0 · receipt-lifecycle 54/0
  password-gate 60/0 · check-worktree 缺失 0
```

**既有 7 套件断言数 29/51/52/97/87/107/54 与本任务前完全一致。**

**4) 其他检查**

| 检查 | 结果 | 退出码 |
|---|---|---|
| `grep 666888 js/` | **只命中 `js/modules/config.js` 一处**（验收项） | — |
| 四语言 hint 禁用词扫描 | 四种语言均 0 命中 | — |
| `node node_modules/eslint/bin/eslint.js .` | 0 error / 1 warning（既有） | 0 |
| `node tools/check-worktree.mjs` | 未发现被删除的已跟踪文件 | 0 |
| `git diff --check` | 无空白错误 | 0 |
| 完整 diff 范围 | 8 文件，全在 SCOPE 内（见第一节） | — |

### 四、已知问题与需要主 AI 确认的三处

1. **损坏时间戳的行为是「有意收紧」，与任务卡括注不一致。**
   任务卡要求 3 写「非法/损坏的 `passwordSetTime` 按『已过期』处理（弹窗）——
   **与现状 `parseInt` 行为对齐**」。但现状**并不弹窗**：
   `parseInt("abc")` → NaN → `(Date.now() - NaN) > expiry` → `false` → 不要求验证。
   我按该条**显式的行为要求**（以及要求 6 的「非法时间戳→弹」）实现，
   即偏离了括注里的「与现状对齐」。反向验证已证明这是可区分的行为差异
   （回退版 4 条「时间戳损坏 → 弹窗」失败）。

2. **任务卡 SCOPE 把文案列在 `js/modules/language.js`，但文案实际在 `js/modules/translations.js`**
   （`language.js` 内没有任何文案，它只负责语言状态与切换）。
   改动落在实际位置；反向验证覆盖的也是 `password.js` + `translations.js` 两个文件。
   若希望 `language.js` 也出现改动，请指明要改什么。

3. **文档里的默认密码字面量**：验收项是 `grep 666888 js/` 只命中 `config.js`，
   这一条已满足。但**仓库文档**里仍有多处提到该字面量与旧符号
   （`README.md`、`TESTING.md`、`NEW_FEATURES.md`、`docs/DATA_FLOW.md`、
   `docs/IMPLEMENTATION_CHECKLIST.md`、`.history/`）—— 不在 SCOPE 内，**未改**，请代入审计同步。
   另外 `password.js` 的注释里我刻意**不写**该字面量，否则会破坏上面那条验收。

### 五、未执行的验证

- 未做真实的"人类手输密码"手动验证 —— 回归套件通过 CDP 走的是真实交互路径
  （填 `#passwordInput` → 点 `#verifyPassword` → 观察弹窗与错误提示），但非人工肉眼确认。
- 未验证 `getRemainingDays()` 的业务影响 —— 全仓无调用方（已确认），故只做了
  与 `isPasswordExpired` 一致的损坏值处理，未追加断言。

---

### 附：GOV-002 守卫修复（Human 本轮另行授权，独立分支）

> 这一节不属于 CM-010 的 SCOPE。Human 在本轮明确要求「同时将守卫修复（不要在 tools）」，
> 因此**单独开分支**完成，未混入 CM-010 的提交，供主 AI 单独审查。

**分支**：`codex/gov002-guard-outside-worktree`（从 `ab28b55` 创建）
**提交**：`ef85ff4`（守卫移出 + 自安装 + 钩子三级回退）、`68616ce`（README 更新）

**根因（第 4 次复发的定论）**：守卫原来住在 `tools/worktree-guard.mjs`，
而 `tools/` 正是会被级联搬走的目录之一 —— **守卫与被保护物同归于尽**：
钩子报 `MODULE_NOT_FOUND`，恢复从未发生且无任何提示（日志也写不出来）。
CM-007 / CM-008 / CM-009 + 本次共四次，同一根因。

**实施时它又现场复发了一次（活证据）**：
执行 `git switch main` 时 post-checkout 钩子报
`Error: Cannot find module ...\tools\worktree-guard.mjs`，
同时 `git status` 显示 **42 个文件** 被搬走（整个 `docs/` 24 个 + `tools/` 19 个，
守卫与 `check-worktree` 都在其中）。已按既定程序 `git restore -- .` 零丢失恢复。

**改动**：

| 层 | 位置 | 作用 |
|---|---|---|
| 1 | `scripts/worktree-guard.mjs` | 权威版本，**已移出 `tools/`**；ROOT 解析支持 `CALLME_WT_ROOT` 与 `git rev-parse --show-toplevel`，不再假设"脚本在工作树里" |
| 2 | `<git-dir>/worktree-guard.mjs` | `selfInstall()` 每次运行自动安装的副本。`.git/` 在工作树之外，级联搬不到 |
| 3 | `.githooks/*` 内联 | 前两层都不可用时，`git diff --name-only --diff-filter=D HEAD \| git restore --pathspec-from-file=-` 最小应急恢复 |

钩子按 1 → 2 → 3 依次尝试。判定规则未变（`intended` / `missing` / `collateral`）。

**验证证据（实跑）**：

```text
测试 A：从 scripts/ 运行 → 自安装成功（.git/worktree-guard.mjs，8573 bytes）
测试 C：纯 unlink 3 个文件 → 守卫检测并全部恢复
测试 D（决定性）：移除 scripts/worktree-guard.mjs + 移除工作区文件 → 跑真实钩子
        → 守卫横幅仍出现、受害文件被恢复
        → 证明走的是第 2 层 .git/ 副本，而非常规路径
```

> `git rm tools/worktree-guard.mjs` 本身又触发了一次 `tools/` 级联（20 个文件）——
> 而位于 `scripts/` 的新守卫存活并全部恢复了它们，这也是修复有效的现场证据。

**合并后需要主 AI 同步的文档**：`AGENTS.md` 里提到守卫路径/钩子连线的段落
（我没动 `AGENTS.md`，按既有分工由主 AI 同步）。

## REVIEW RESULT

CM-009：**PASS**（2026-09-19，主 AI 独立验收）。

- Diff 审查：14 文件全在 SCOPE 内；`js/`、HTML、CSS 零改动；`chrome-path.mjs` 优先级设计正确且不抛异常；`run-all.mjs` 串行、逐项报退出码、失败可定位；CI workflow 6 步合理（lint 前置快速失败）。
- 独立复跑：`run-all.mjs` 全量 9/9、477 断言、212s；`--skip-browser` 2/2；CM009_LOG 落盘正常；YAML 真实解析 + 24 项结构断言全过；CHROME_PATH 抽验 cooldown 87/0；路径优先级 7 项断言全过；7 套件断言数与任务前一致。
- 合并：`af83b9d..557d6f8` 快进，合并后 check-worktree 缺失 0、快速路径 2/2。
- 事故：`git checkout main` 时 tools/ 第三次被级联搬走（11 条 D），按既定程序 `git restore -- .` 零丢失恢复；同一根因（守卫住在 tools/ 里），候选修法仍待授权。
- 主 AI 顺带同步 `AGENTS.md` 质量命令段（`npm test`/CI 已存在）。
- ⚠️ CI 未在真实 Actions 跑过：首次 push 后需人工核对 Actions 页面。
- 完整记录：`docs/handoff/archive/CM-009.md`。

## NEXT ACTION

外部 AI 请读取最新的 `AGENTS.md` 和本文件，用 `git rev-parse --short HEAD` 确认实际 HEAD 后创建 `codex/cm010-password-threat-model`（**创建/切换分支后立即跑 `node tools/check-worktree.mjs`**），按 `CURRENT TASK` 执行。完成后更新本文件的 `EXECUTION STATUS` 和 `EXECUTION REPORT`，等待主 AI 独立验收。**不要修改或合并 `main`，不要 push。**
