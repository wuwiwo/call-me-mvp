# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

CM-009 — 统一测试入口、CI（lint + 测试）与测试资产治理

PHASE: Engineering / Tooling
PRIORITY: P2/P3

OBJECTIVE:

为现有 8 个回归套件提供**单一稳定入口**与 **CI 可运行配置**：一条命令串行跑完全部套件（lint + 测试），GitHub Actions 上可复现；同时把测试资产治理规则固化（跨机器浏览器配置、端口分配、日志/证据规则）。不新增业务行为、不改产品代码。

CONTEXT:

- 现有套件（全部零依赖、自带静态服务器 + headless Chrome，HTTP 8899 必须串行）：`e2e.mjs`（CM-002）、`storage-resilience.mjs`（CM-003）、`button-ids.mjs`（CM-004）、`input-safety.mjs`（CM-005）、`cooldown.mjs`（CM-006）、`history-language.mjs`（CM-007）、`receipt-lifecycle.mjs`（CM-008），外加 `check-worktree.mjs`。
- 反向验证脚本（`negative-*.mjs`）会临时改写源码，属手工工具，**不进 CI、不进默认套件入口**。
- 各套件 Chrome 路径默认值是本机 Windows 路径（如 `C:/Program Files/Google/Chrome/Application/chrome.exe`），部分已有 `<套件>_CHROME` 环境变量；CI（ubuntu）上 Chrome 路径不同，需要统一解析。
- `ROADMAP.md:150-153`：CM-009 = 最小测试脚本 + CI lint/test + 测试资产治理（稳定命令、CI 入口、跨机器 Chrome 配置、证据删除和日志脱敏规则）。
- 端口约定：HTTP 一律 8899 串行；CDP 9444/9445/9446/9447/9448/9449 已分配（9446 被 CM-004 与 CM-006 共用，串行下无实际冲突，属已知项）。新套件端口分配规则应写入 `tools/README.md`。
- 本机 npm shim 不可靠是本机环境问题，**不是**不在 package.json 登记脚本的理由；登记时以 `node <真实入口>` 为准，绕开 `.bin` shim。

SCOPE:

- `tools/run-all.mjs`（新增）：串行执行 lint（`node node_modules/eslint/bin/eslint.js .`）+ 上述 7 个回归套件 + `check-worktree.mjs`，逐项报告退出码，任一失败则整体非零退出；支持环境变量跳过 Chrome 依赖套件（如 `CM009_SKIP_BROWSER=1` 时只跑 lint + check-worktree）。
- `package.json`：登记 `test` / `test:all` 等指向真实入口的 scripts。
- `.github/workflows/ci.yml`（新增）：push/PR 触发，ubuntu-latest，Node 22，`npm ci`、lint、跑 `tools/run-all.mjs`（浏览器套件用 CI 自带 Chrome）。
- 各套件 Chrome 路径解析统一化：允许 `<套件>_CHROME` 覆盖，默认依次尝试环境变量 `CHROME_PATH`、常见 Linux/macOS/Windows 路径、`which google-chrome`。**只改路径解析逻辑，不改断言**。
- `tools/README.md`：登记新入口、CI 使用方式、端口分配表、日志不入库/证据删除规则、反向验证属手工工具的说明。
- 本通信文档与归档。

NON-GOALS:

- 不改任何业务源码（`js/`、`*.html`、`*.css`）。
- 不新增测试断言、不改既有套件的测试语义（只允许改 Chrome 路径解析）。
- 不做 format 基线：Prettier 全仓格式化与 CI format-check 属独立的「format 基线」任务（CM-002 已记录 prettier 既有失败），本任务 CI **不含** format-check。
- 不把 `negative-*.mjs` 纳入 CI 或默认入口。
- 不引入任何运行时依赖；CI 只用 `npm ci` 安装既有 devDependencies。
- 不顺手处理 CM-010（password 威胁模型）或既有 lint warning。

ACCEPTANCE CRITERIA:

- [ ] `node tools/run-all.mjs` 一条命令串行跑完 lint + 7 套件 + check-worktree，全部通过，退出码 0；任一失败整体非零。
- [ ] `node tools/run-all.mjs` 总输出包含每个套件的名、断言汇总与退出码，失败时能定位到具体套件。
- [ ] CI workflow 语法有效（`actionlint` 或人工核对），在本机无法跑 Actions 时给出**可复核的干跑证据**：workflow YAML 静态检查 + 本地模拟 CI 命令序列全部通过。
- [ ] 各套件在 `CHROME_PATH=<有效 Chrome>` 下能跑通（抽验至少 2 个套件）；路径解析逻辑改动前后断言数不变。
- [ ] 既有 7 套件逐一单跑不回归（断言数与本任务前一致：29/51/52/97/87/107/54）。
- [ ] `tools/README.md` 端口分配表、日志/证据规则、CI 说明齐备。
- [ ] `node tools/check-worktree.mjs`、lint 0 error、`git diff --check` 通过；`js/` 零改动。

VERIFICATION:

1. `node tools/run-all.mjs`（全量，串行，预计 6–10 分钟）。
2. 逐一单跑 7 个既有套件复核断言数。
3. `CM009_SKIP_BROWSER=1 node tools/run-all.mjs` 验证快速路径。
4. `CHROME_PATH=<chrome 实际路径> node tools/receipt-lifecycle.mjs` 等抽验路径覆盖。
5. workflow YAML 静态检查；本地按 CI 命令序列（`npm ci` 可跳过，用既有 node_modules）逐步执行并记录退出码。
6. `node tools/check-worktree.mjs`、`node node_modules/eslint/bin/eslint.js .`、`git diff --check`，核对 diff 中 `js/` 为零改动。

BRANCH:

从本地 `main` 的**当前最新稳定 HEAD** 创建并使用：`codex/cm009-test-ci`。外部 AI 开工前必须用 `git rev-parse --short HEAD` 确认（任务卡定稿时的 HEAD 见 EXECUTION STATUS；若其后仅有 docs-only 提交，直接用最新 HEAD）。

注意：本机存在「checkout/merge 触发工作区级联丢失」环境缺陷（详见 `docs/handoff/archive/WORKTREE-FILE-LOSS.md` 与 `CM-007.md`）。**创建分支或切换分支后必须立即运行 `node tools/check-worktree.mjs`**；若已跟踪文件缺失，先确认非有意删除，再 `git restore -- <路径>` 恢复，不得把缺失当作删除提交。

另注意 CM-008 教训：**验收前不得合并 main**。任务分支上的反向验证若以 `main` 为基线，注意 main 已含哪些改造；必要时显式指定改造前 commit。

## EXECUTION STATUS

```text
状态：DISPATCHED — 等待外部 Execution AI 认领
任务分支：codex/cm009-test-ci（待创建）
任务基线：本面板提交后的实际 HEAD（开工前以 git rev-parse --short HEAD 实测为准）
```

## EXECUTION REPORT

（待外部 AI 填写：修改文件、实现摘要、测试命令与完整结果、退出码、已知问题、commit。）

## REVIEW RESULT

CM-008：**PASS**（2026-09-19，主 AI 独立验收）。

- Diff 审查：5 文件全部在 SCOPE 内；`notification.js` 句柄 + 代际守卫实现与 CM-006 模式一致，三处异步边界校验完整，终态清句柄正确；`setReceiptStatus` 参数遮蔽已修复；单次节奏（2s × 15）未变。
- 独立复跑与执行 AI 报告逐项一致：receipt-lifecycle 54/0、e2e 29/0、cooldown 87/0、input-safety 97/0、button-ids 52/0、storage-resilience 51/0、history-language 107/0、lint 0 error/1 既有 warning、diff-check 0、check-worktree 缺失 0。
- 反向验证：因 main 已含改造，默认基线失效（exit 2），改用 `CM008_BASE_REF=2dea212` 复跑：已改造 54/0、回退 31/20，取消能力 6 条 + 并发隔离 4 条 + 参数遮蔽 4 条全部命中，binCalls=16 与设计预期吻合，源码还原 true。区分力成立。
- **流程偏差**：reflog 显示 `merge codex/cm008-receipt-lifecycle: Fast-forward` 先于本次验收发生（合并先于验收，顺序违反协议；执行 AI 报告时点 main 未被修改）。验收为 PASS 且合并方式即授权的快进合并，结果与协议终态一致，未回退。已在归档中记录并派生教训（合并后反向验证须显式指定基线 commit）。
- 主 AI 顺带同步过时审计描述：TECH_DEBT CM-001-TD-07 标记解决、DATA_FLOW 回执段、ARCHITECTURE 网络模型、AGENTS.md 高风险区域三条（CM-006/007/008）。
- 完整记录：`docs/handoff/archive/CM-008.md`。

## NEXT ACTION

外部 AI 请读取最新的 `AGENTS.md` 和本文件，用 `git rev-parse --short HEAD` 确认实际 HEAD 后创建 `codex/cm009-test-ci`（**创建/切换分支后立即跑 `node tools/check-worktree.mjs`**），按 `CURRENT TASK` 执行。完成后更新本文件的 `EXECUTION STATUS` 和 `EXECUTION REPORT`，等待主 AI 独立验收。**不要修改或合并 `main`，不要 push。**
