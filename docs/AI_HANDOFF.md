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
状态：DISPATCHED — 等待外部 Execution AI 认领
任务分支：codex/cm010-password-threat-model（待创建）
任务基线：本面板提交后的实际 HEAD（开工前以 git rev-parse --short HEAD 实测为准）
```

## EXECUTION REPORT

（待外部 AI 填写：修改文件、实现摘要、测试命令与完整结果、退出码、已知问题、commit。）

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
