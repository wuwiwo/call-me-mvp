# AI 协作通信文档

本文件是 Call Me MVP 主指挥 AI 与外部 Execution AI 的唯一当前通信文档。

## CURRENT TASK

当前没有新任务。CM-002 验证工具已在分支 `chore/cm002-verification-tools` 完成，等待主指挥 AI Review/建议合并 PR #1。

## EXECUTION STATUS

```text
状态：WAITING_FOR_REVIEW
当前分支：chore/cm002-verification-tools
当前 commit：ffad349
PR：#1
最近自检：2026-09-17 17:29（外部 AI 待命巡检，未修改任何文件）
```

### 外部 AI 待命巡检（2026-09-17 17:29）

- 已阅读 `AGENTS.md`。
- `git status --branch`：分支 `chore/cm002-verification-tools`，与 `origin` 同步；HEAD = `ffad349`。
- 工作区未跟踪文件仅 7 个治理/审计文档：`AGENTS.md`、`docs/AI_HANDOFF.md`、`docs/ARCHITECTURE.md`、`docs/DATA_FLOW.md`、`docs/PROJECT_ANALYSIS.md`、`docs/ROADMAP.md`、`docs/TECH_DEBT.md`。均为既有未提交文档，外部 AI 未 add / 未 commit / 未删除。
- `docs/tasks/ACTIVE.md`、`docs/tasks/CM-XXX.md` 均不存在，`docs/tasks/` 与 `docs/reports/` 目录当前不存在；本次以本文件（`AGENTS.md` 定义的唯一通信文档）为状态来源。
- 结论：无新任务卡，外部 AI 保持待命，未修改代码、未创建 commit、未触碰 PR #1。

## BLOCKED — 等待主指挥 AI 与 Human 决策（2026-09-17 17:35）

外部 AI 收到 Human 指令「查看当前状态，现在先合并，清理工作区未提交」。
经核查，该指令包含两个动作，**均触及门禁，外部 AI 未执行任何一项**，在此上报并请求裁决。

```text
状态：BLOCKED_BY_GATE
阻塞项：2
未执行动作：merge PR #1、清理未跟踪文档
当前工作区：保持原样（无 add / 无 commit / 无 delete / 无 merge）
```

### 状态核查结果

```text
分支：chore/cm002-verification-tools（与 origin 同步）
HEAD：ffad349（test: 补充 CM-002 可复现端到端验证工具）
领先 origin/main：1 个 commit
origin/main：c4b074f
工作区：7 个未跟踪文档，0 个已跟踪文件改动（git diff --stat HEAD 为空）
本机 gh CLI：未安装（which gh → not found）
```

### 阻塞项 1：合并 PR #1

- **能力层面**：本机无 `gh` CLI；上一轮 `mcp__github__create_pull_request` 曾报
  `403 Resource not accessible by integration`（连接器权限不足）。外部 AI 无可用 GitHub 写通道。
- **门禁层面**：`AGENTS.md:187-192`「PR 门禁」规定
  「PR 合并属于 Human 的明确门禁；在 Human 明确授权前，主 AI 和外部 AI 都不自动 merge」。
  REVIEW RESULT 当前为 PASS，但**建议合并 ≠ 授权合并**。
- **Human 指令「现在先合并」的授权主体存在歧义**：无法判定 Human 是在
  ① 自行到 GitHub 点击合并，还是 ② 授权 AI 代为合并。
- **外部 AI 处置**：未执行合并，未尝试绕过门禁。
- **请求裁决**：请主指挥 AI 向 Human 明确 —— 由 Human 本人合并，还是明确授权 AI 执行。
  若选择后者，外部 AI 可用 Git 凭据 + GitHub REST API（`POST /repos/{owner}/{repo}/pulls/1/merge`，
  走 `ProxyHandler`，见 2026-09-17 记忆的建 PR 工具链）执行。
- **顺序说明**：`AGENTS.md:192` 要求「新任务原则上从已验收并合并的基线开始」，
  故合并应先于 CM-003 派发，当前顺序无冲突。

### 阻塞项 2：「清理工作区未提交」

- **对象**：7 个未跟踪文件 —— `AGENTS.md`、`docs/AI_HANDOFF.md`、`docs/ARCHITECTURE.md`、
  `docs/DATA_FLOW.md`、`docs/PROJECT_ANALYSIS.md`、`docs/ROADMAP.md`、`docs/TECH_DEBT.md`。
- **性质**：这些是项目**治理与审计基线**，不是临时产物。其中 `docs/AI_HANDOFF.md` 是
  `AGENTS.md:115-138` 定义的**唯一通信文档**；`docs/TECH_DEBT.md` 载有 CM-001-TD-01..N 问题清单，
  是后续任务卡（如 CM-003 存储容错）的依据来源。
- **「清理」存在三种互斥解读，误判后果不可逆**：
  1. **删除** → 审计基线与唯一通信文档丢失，协作链路断链。
  2. **提交入库** → 与 `AGENTS.md:39`「不修改、提交或删除用户已有的无关改动」及
     2026-09-17 记忆「`AGENTS.md` 与 `docs/*.md` 是未跟踪的用户已有改动，**不得纳入 commit**」相冲突；
     且属范围外变更（`AGENTS.md:248`：必须单独报告、单独提交）。
  3. **原状不动** → 无动作，仅确认其内容。
- **外部 AI 判断（仅供参考，非结论）**：从项目长期健康看，这 7 个文档应纳入版本控制 ——
  它们目前仅存在于本地，磁盘损坏即导致治理依据灭失；但这是范围外变更，需主指挥 AI / Human 先行定调。
- **外部 AI 处置**：未删除、未 add、未 commit、未修改，工作区保持原样。
- **请求裁决**：请主指挥 AI 向 Human 取得明确选择 —— 删除 / 入库（单独 commit，本地或推送） / 原状不动。
  若为删除，外部 AI 将先把内容摘要落盘至 `.workbuddy/` 再执行。

### 外部 AI 执行规则（本次遵循）

- `AGENTS.md:138`：`AI_HANDOFF.md` 无待执行任务时，外部 AI 必须保持待命，不得自行修改代码。
- `AGENTS.md:190`：Human 明确授权前，外部 AI 不自动 merge。
- 结论：**在当前门禁未明确解除前，外部 AI 不执行任何写操作。**

## EXECUTION REPORT

CM-002 的验证资产已提交到 `tools/`，包括静态服务器、CDP E2E、反向验证、README 和验收报告。执行代理报告 29/29 E2E 通过，`npm run lint` 通过。主指挥 AI 已独立复跑当前 `tools/e2e.mjs`，结果为 29 passed / 0 failed。

## REVIEW RESULT

CM-002 代码和验证结果：PASS。

Prettier 仍失败，但已证明修改前版本同样失败，属于既有工程基线问题，不阻断 CM-002。

`tools/negative.mjs` 会临时改写业务源码，当前应视为手工反向验证工具，不应直接纳入普通 CI。

## NEXT ACTION

等待 Human 决定是否合并 PR #1。合并后，主指挥 AI 更新本文件并写入 CM-003 任务；在此之前外部 AI 不得自行修改代码或开始新任务。

