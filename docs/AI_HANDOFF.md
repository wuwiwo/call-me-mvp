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
状态：READY_FOR_REVIEW — CM-009 已实施完成并通过本地验证，等待主 AI 独立验收
任务分支：codex/cm009-test-ci
任务基线：af83b9d（实测 HEAD，即主 AI 推送后的 main）
当前工作分支：codex/cm009-test-ci
main：未被修改（本任务全部提交都在任务分支上）；本任务**未 push**
工作区：干净；check-worktree 缺失 0（建分支后立即复核，之后各次运行前后亦复核）

本任务提交：
  6923c32  test: Chrome 路径解析统一到共享模块
  303a9f2  test: 新增统一测试入口 tools/run-all.mjs
  8b6ec85  chore: npm 脚本指向真实入口并登记 test 系列
  0b280cf  ci: 新增 GitHub Actions 工作流（lint + 回归套件）
  88c9be3  fix: eslint 忽略 .workbuddy/ 本地目录
  c635814  docs: 登记统一入口、CI 与测试资产治理规则
  （另有 1 个面板回填提交，见 git log）

改动范围：13 个文件；`js/`、`*.html`、`*.css` **零改动**（已用 git diff --name-only 核对）
```

## EXECUTION REPORT

> 报告不等于主 AI 验收通过。以下命令与输出均为本机实跑结果，可直接复跑复核。

### 一、修改文件

| 文件 | 改动 |
|---|---|
| `tools/run-all.mjs` | **新增**：统一测试入口（lint + 7 套件 + check-worktree，串行、逐项报退出码） |
| `tools/chrome-path.mjs` | **新增**：套件共用的 Chrome 可执行文件解析 |
| `.github/workflows/ci.yml` | **新增**：GitHub Actions（push/PR，ubuntu + Node 22） |
| `tools/e2e.mjs` 等 **7 个套件** | 内联 Chrome 路径 → `resolveChrome(process.env.CMxxx_CHROME)`（只改路径解析） |
| `package.json` | `lint`/`lint:fix` 改指真实入口；新增 `test`/`test:all`/`test:quick` |
| `eslint.config.js` | `ignores` 增加 `.workbuddy/`（修 lint 闸门被本地目录打红） |
| `tools/README.md` | 新增「CI」「测试资产治理」两章；修正两条被本次改动作废的旧说明 |

### 二、实现摘要

**统一入口**：`node tools/run-all.mjs` = lint → 7 套件 → check-worktree，逐项输出
套件名 / 断言汇总 / 退出码 / 耗时；任一失败整体非零，并列出该套件的 FAIL 明细
（无 FAIL 行则打印输出末尾 15 行）。支持 `--skip-browser` 与 `CM009_SKIP_BROWSER=1`
两种快速路径写法（npm scripts 里 `VAR=1` 在 Windows 不生效，故额外提供 CLI 开关）。
单项默认 15 分钟超时，避免 Chrome 卡死时永久挂住。

**Chrome 路径统一**：优先级 `<套件>_CHROME` > `CHROME_PATH` > 当前平台常见位置
> 其他平台常见位置 > `which`（仅非 Windows）。找不到时**不抛异常**：
打印尝试清单后回退首个候选，由 spawn 报错 —— 套件仍能先打印环境头，失败可定位。

**CI**：`npm ci` → `npm run lint` → `npm test`，`*.log` 以 artifact 上传。

### 三、测试结果（全部实跑）

**1) 统一入口全量**

```text
npm test   （= node tools/run-all.mjs，经 npm 真实 JS 入口执行）
→ 项数：9/9 通过；合计 477 项断言，失败 0；总耗时 228.2s；退出码 0

  lint                 exit=0    2.0s   0 errors, 1 warning（既有 worktree-guard）
  e2e（CM-002）        exit=0    4.3s   断言：29 passed, 0 failed
  storage-resilience   exit=0   34.2s   断言：51 passed, 0 failed
  button-ids（CM-004） exit=0   15.5s   断言：52 passed, 0 failed
  input-safety（CM-005）exit=0  17.7s   断言：97 passed, 0 failed
  cooldown（CM-006）   exit=0   20.0s   断言：87 passed, 0 failed
  history-language     exit=0   15.8s   断言：107 passed, 0 failed
  receipt-lifecycle    exit=0  119.1s   断言：54 passed, 0 failed
  check-worktree       exit=0    0.7s   未发现被删除的已跟踪文件
```

**7 个套件的断言数 29/51/52/97/87/107/54 与本任务前完全一致**（路径解析改动未触碰断言）。

**2) 快速路径**

```text
node tools/run-all.mjs --skip-browser
→ 模式：快速（仅 lint + check-worktree）；项数 2/2 通过；约 3s；退出码 0
```

**3) CI 命令序列本地干跑**

| CI 步骤 | 本机执行 | 结果 | 退出码 |
|---|---|---|---|
| `npm ci` | `npm ci --dry-run`（AC 允许跳过真实安装） | `up to date in 2s`，lockfile 与 package.json 一致 | 0 |
| `npm run lint` | `npm run lint` | `0 errors, 1 warning` | 0 |
| `npm test` | `npm test` | 9/9 通过（见上） | 0 |

> **本机 `npm` 不能直接用**：裸 `npm` 会去拉 `wsl.exe`，被沙箱安全策略拦截
> （`PROGRAM BLOCKED BY SECURITY POLICY ... wsl.exe`）。
> 上述命令是经 npm 的**真实 JS 入口**执行的：
> `node <node 目录>/node_modules/npm/bin/npm-cli.js <script>`。
> `package.json` 的脚本本身已指向真实入口，因此直接执行脚本内容行为一致
> （`node node_modules/eslint/bin/eslint.js .` = `npm run lint`；
> `node tools/run-all.mjs` = `npm test`）。这一点已写入 `tools/README.md`。

**4) workflow 静态校验（本机无 actionlint/yamllint，用真实 YAML 解析器）**

```text
PyYAML 6.0.3 safe_load 真实解析 .github/workflows/ci.yml → 成功
关键结构断言：23/23 通过，退出码 0
  含 name/on/permissions/jobs；触发含 push(main)/pull_request/workflow_dispatch
  jobs.test: runs-on ubuntu-latest、timeout-minutes 30、6 步
  actions 均带版本号（checkout@v4 / setup-node@v4 / upload-artifact@v4）
  setup-node node-version = 22
  含 npm ci、npm run lint、npm test
  测试步骤设置 CM009_LOG；**不含任何 negative-* 引用**
```

证据脚本为一次性工具（`.workbuddy/cm009_ci_yaml_check.py`，不入库）。
复现方式：`python -m pip install pyyaml`（装入隔离 venv）后运行该脚本。

**5) Chrome 路径解析**

```text
优先级检查（.workbuddy/cm009_chrome_resolve_check.mjs，一次性工具）
→ 9/9 通过，退出码 0
  无环境变量时首选仍是原 Windows 默认路径（行为不变）
  CHROME_PATH 排在默认路径之前；<套件>_CHROME 又排在 CHROME_PATH 之前
  非法 CHROME_PATH 不抛异常、仍有真实默认路径兜底
  空串覆盖被剔除；win32 下不追加 which 探测结果

CHROME_PATH 抽验（AC 要求 ≥2 个套件）
  CHROME_PATH=<chrome> node tools/e2e.mjs        → 29 passed, 0 failed，exit 0
  CHROME_PATH=<chrome> node tools/button-ids.mjs → 52 passed, 0 failed，exit 0
  两套件环境头显示的 Chrome 路径即 CHROME_PATH 指定的值
```

**6) 其他检查**

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node node_modules/eslint/bin/eslint.js .` | **0 error / 1 warning**（既有 warning 见第五节） | 0 |
| `node tools/check-worktree.mjs` | 未发现被删除的已跟踪文件 | 0 |
| `git diff --check` | 无空白错误 | 0 |
| `git diff --name-only main..HEAD -- js/ *.html *.css` | **无输出（js/ 零改动）** | 0 |

### 四、过程中由检查发现并修掉的两处

1. **`.workbuddy/` 会打红 lint 闸门**（真实缺陷，已修）：`eslint.config.js` 的
   `ignores` 只有 `node_modules/` 与 `.history/`。我把证据脚本放进 `.workbuddy/`
   后，lint 立刻报 9 个错（该目录不在 `files: ['tools/**/*.mjs']` 的 Node 全局覆盖内，
   `process` 被判定未定义）。后果不止于我这一次：**任何放进该目录的本地脚本都会
   打红 `npm run lint` / `npm test`**，而它又被 gitignore、CI 上不存在
   → 本地红、CI 绿的不一致。已加入 `ignores`（提交 `88c9be3`）。
2. **统一入口自身的日志收集缺陷**（已修）：`run-all.mjs` 初版把 `out()` 定义在那里
   却全程用 `console.log` 输出，**`CM009_LOG` 会收到空内容**。这是 lint 的
   `no-unused-vars` 顺带暴露的：`out` 定义了却没人用。已把全部输出改走 `out()`
   （31 处），并把 `--verbose` 的原始输出也并入收集缓冲。

### 五、已知问题与范围外发现（**未擅自修复**）

1. **`AGENTS.md:295` 已过时**：原文「**没有 `npm test`、单元测试、集成测试、
   E2E 测试或 GitHub Actions**。`TESTING.md` 是手工检查清单」——
   CM-009 之后这三项（`npm test`、E2E 套件、GitHub Actions）都已存在。
   `AGENTS.md` 不在本任务 SCOPE 内，**未改**，请主 AI 同步。
   另：`AGENTS.md:286-288` 记录的 `npm run lint` / `format:check` / `format`
   命令清单也可一并核对。

2. **`format` / `format:check` 仍走 prettier 的 `.bin` shim** —— 在本机必然失败。
   本任务 NON-GOALS 明确排除格式化基线，**未动**。若要与 `lint` 一致地指向真实入口，
   属独立任务。

3. **`tools/worktree-guard.mjs:117` 的 lint warning** 仍在（`catch (e)` 的 `e` 未使用），
   与 CM-006/007/008 报告一致。NON-GOALS 明确规定不顺手处理既有 lint warning，**未修**。

4. **CDP 端口 9446 被 CM-004 与 CM-006 共用** —— 已在 `tools/README.md` 的端口分配表
   中标注为已知项（两者 HTTP 同为 8899、本就串行）。本任务未改端口，**仅登记**。

5. **`js/` 外的 `TESTING.md`** 是手工检查清单，本任务未涉及；它与新的自动化入口
   之间的关系可由主 AI 决定是否需要在后续任务中说明。

### 六、未执行的验证

- **未真实执行 GitHub Actions**（本机无法跑 Actions）。替代证据见第三节第 3、4 项：
  YAML 真实解析 + 关键结构断言 + 本地按同一命令序列干跑。**首次 push 后需人工核对
  Actions 页面确实跑起来并通过** —— 这是本任务唯一无法在本地闭环的验收点。
- **未在非 Windows 平台运行套件**：Linux/macOS 的路径解析分支只做了
  代码级检查（优先级断言 + 候选列表含对应平台的常见路径），
  未在真实 Linux 上跑过 Chrome。CI 首次运行即是对该分支的真实验证。
- **未测「所有候选都不存在」的分支**：本机 Windows 默认路径真实存在，
  无法在不临时改名真实文件的前提下构造该场景。已通过「非法 `CHROME_PATH`
  不抛异常且能回退」间接覆盖了不崩的语义，但"打印清单并回退首个候选"这条
  纯路径未实测。
- **未跑反向验证**（`negative-*.mjs`）：本任务不涉及业务源码改造，
  且这些脚本会临时改写源码、不进 CI。既有 7 个反向验证脚本本次未复跑。

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
