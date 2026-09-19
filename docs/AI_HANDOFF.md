# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

**无活动任务**。CM-010 已验收合并完成，等 Human 明示下个任务方向。

下个任务候选（见 NEXT ACTION）：

- **GOV-002 守卫修复**（推荐）：分支 `codex/gov002-guard-outside-worktree` 已实施 + 自验证，待主 AI 独立验收 + 合并。工作区文件丢失 bug 已复发 5 次，根因修复应尽先进 main。
- CM-001-TD-08 余项：`soundManager.playNotificationSound(false)` 访问未配置的 `notifications.error`（P2 小坑）。
- CM-001-TD-09：format 基线未达标（29 文件 Prettier 失败，P3 清理）。

## EXECUTION STATUS

```text
状态：IDLE — 无活动任务，等 Human 明示下个任务方向
当前分支：main（HEAD: dba7e0c）
工作区：干净；check-worktree 缺失 0
远端：origin/main 落后本地 10 个提交（CM-009 收尾 + CM-010 全套 + 主 AI 同步），待 push

CM-010 已完成：
  - 任务分支 codex/cm010-password-threat-model 已快进合并到 main（c0ad0a9）
  - 主 AI 同步提交 dba7e0c（password.js:97 fallback 修复 + AGENTS.md 密码模块段同步）
  - 归档 docs/handoff/archive/CM-010.md + INDEX.md 已更新
  - 合并后复核：password-gate 60/0、eslint 0 error、check-worktree 缺失 0

GOV-002 守卫修复（独立分支，Human 本轮另行授权，未合并）：
  - 分支 codex/gov002-guard-outside-worktree（2 提交：ef85ff4 + 68616ce）
  - 从 ab28b55 创建，未合并进 main
  - 已实施 + 自验证（含决定性测试 D：移除 scripts/ 权威版本后真实钩子仍走 .git/ 副本）
  - 待主 AI 独立验收 + 合并
```

## EXECUTION REPORT

无活动任务。CM-010 完整协作记录已归档至 [`docs/handoff/archive/CM-010.md`](handoff/archive/CM-010.md)。

## REVIEW RESULT

**CM-010：CONDITIONAL PASS**（2026-09-19，主 AI 独立验收，已完成合并 + 同步 + 归档）。

9 项验收项全过：威胁模型落 `docs/SECURITY.md`、`grep 666888 js/` 只命中 `config.js` 一处、hint 四语言诚实表述、损坏时间戳 fail-closed、`password-gate` 60/0、反向验证区分力充分（已改造 60/0 vs 回退 43/17，三类失败标记命中）、既有 7 套件断言数不变（29/51/52/97/87/107/54）、`run-all` 全量 10/10（537 项断言 0 失败）、lint 0 error / check-worktree 缺失 0 / diff 范围受控。

三处自陈问题逐一裁决：①时间戳行为收紧 PASS（括注误述现状，执行 AI 按显式行为实现并主动披露，fail-closed 是闸门合理默认）②SCOPE 文件名笔误 PASS（任务卡写 `language.js`，文案实际在 `translations.js`，执行 AI 改在实际位置）③文档残留 666888 字面量不在 SCOPE 内，记录待后续处理。

唯一漏改（`password.js:97` fallback 字符串）已由主 AI 在合并后作为同步提交修复（`dba7e0c`），同步后 `password-gate` 60/0 再次复核通过。

完整记录：[`docs/handoff/archive/CM-010.md`](handoff/archive/CM-010.md)。

## NEXT ACTION

等 Human 明示下个任务方向。三个候选：

### 候选 1（推荐）：GOV-002 守卫修复独立验收 + 合并

- 分支 `codex/gov002-guard-outside-worktree` 已存在，无需派发外部 AI，主 AI 直接独立验收
- 验收重点：
  1. `scripts/worktree-guard.mjs` 权威版本 + `selfInstall()` 到 `<git-dir>/worktree-guard.mjs`
  2. 钩子三级回退链路（①工作树内权威版本 → ②`.git/` 副本 → ③钩子内联纯 git 应急）
  3. 决定性测试 D：移除 `scripts/` 权威版本 + 移除工作区文件后跑真实钩子，守卫横幅仍出现、受害文件被恢复（证明走第 2 层 `.git/` 副本）
  4. `run-all.mjs` 全量复核（10/10，537 项断言）
  5. 同步 `AGENTS.md` 守卫路径段（守卫已移出 `tools/` → `scripts/`；钩子三级回退说明）
- 合并价值：工作区文件丢失 bug 已复发 5 次（CM-007/008/009 + GOV-002 实施时 1 次 + CM-010 合并时 1 次），根因修复应尽先进 main
- 风险：合并时若再触发级联，新守卫位于 `scripts/` + `.git/`，不在被级联搬走的目录里，应能存活并恢复

### 候选 2：CM-001-TD-08 余项（错误音效路径）

- `soundManager.playNotificationSound(false)` 访问未配置的 `notifications.error`（P2 小坑）
- 需要派发外部 AI 或主 AI 自己修（小任务）

### 候选 3：CM-001-TD-09（format 基线）

- 29 个文件 Prettier 失败（P3 清理）
- 批量格式化会产生大 diff，需 Human 授权

**外部 AI 暂无任务**。若 Human 选择 GOV-002，分支已存在，主 AI 直接独立验收即可，无需派发外部 AI。若 Human 选择其他任务，主 AI 派发新任务卡。

**push 授权**：Human 本轮已明确授权推送 CM-010。push 后需人工核对 GitHub Actions 页面（CM-009 CI 首次跑真实 Actions，未验证过）。
