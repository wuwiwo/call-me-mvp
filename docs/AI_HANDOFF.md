# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

CM-008 — 已读回执轮询的取消语义与单一所有权

PHASE: Robustness / BugFix
PRIORITY: P2

OBJECTIVE:

让 `notification.js` 的已读回执轮询可取消、单一所有权：新一次发送开始时旧轮询立即停止且不得再写状态条，`#receiptStatus` 只反映最新一次发送的回执；单次发送的轮询节奏与超时语义保持不变。

CONTEXT:

- `js/modules/notification.js:163-191`：`pollReadStatus()` 用递归 `setTimeout(poll, 2000)`，不保存 timer 句柄，无取消机制；一旦启动最长运行 ~30s（15 次 × 2s），期间无法停止。
- 多次发送时轮询并发互踩：旧轮询读到旧 `msgId` 的 read 或超时，会把新消息的状态条覆盖成「已读」或「超时」。
- `docs/TECH_DEBT.md` CM-001-TD-07（第 68-74 行）即本任务。
- `config.js`：`cooldownTime: 60`，冷却窗口（60s）大于轮询窗口（~30s），正常路径不易并发；但请求失败不进冷却、`isRequestPending` 竞态等路径仍可能产生重叠，且 timer 不可取消本身是结构缺陷。

SCOPE:

- `js/modules/notification.js`
- 必要的零依赖回归脚本、`tools/README.md` 和本通信文档

NON-GOALS:

- 不改 webhook 协议、JSONBin 读取方式与 URL、轮询间隔/次数/超时阈值、`#receiptStatus` 的 DOM 结构与视觉样式。
- 不改冷却逻辑（CM-006 已收敛，`countdown` 是唯一责任者）。
- 不引入框架、构建步骤或新的运行时依赖。
- 不顺手修复回执之外的其他路线图任务（CM-009 测试资产、CM-010 password 等）。

IMPLEMENTATION REQUIREMENTS:

1. 轮询必须可取消：保存 timer 句柄或使用代际标记（可参照 CM-006 `countdown.js` 的 `generation` 模式），同一时刻活跃轮询数 ≤ 1。
2. `sendNotification` 发起轮询前必须使旧轮询失效：旧轮询不得再调用 `setReceiptStatus`（包括 timeout 分支）。
3. 单次发送行为不变：2s 间隔、最多 15 次、read/timeout 文案与现状一致。
4. 顺带修复 `setReceiptStatus` 的参数遮蔽：函数参数 `state` 遮蔽了导入的模块 `state`（`notification.js:146`），重命名为 `statusName` 或等价名（该函数在本次改造的写入路径上，属任务内清理）。
5. `pollReadStatus` 对 `binUrl` 缺失、`msgId` 为空、fetch 异常的处理保持现有宽容语义。
6. 不改变 `sendNotification` 的历史记录写入与翻译文案路径。

ACCEPTANCE CRITERIA:

- [ ] 模拟第二次发送时第一次轮询仍在进行：第一次轮询停止，不再更新 `#receiptStatus`。
- [ ] 第二次发送后状态条从 sent 开始，最终 read/timeout 由第二次发送的回执决定。
- [ ] 单次发送：读到 read → 状态条 read；始终读不到 → 15 次后 timeout（节奏与现状一致）。
- [ ] 同一时刻活跃轮询 ≤ 1（可量化断言，如包装 setTimeout 计数）。
- [ ] 既有套件全部不回归：e2e / cooldown / input-safety / button-ids / storage-resilience / history-language。
- [ ] 新增回执回归脚本可复跑，覆盖并发打断、read、timeout、`binUrl` 缺失场景，含反向验证（回退版必须失败且命中修复点关键字）。
- [ ] `node tools/check-worktree.mjs`、`node node_modules/eslint/bin/eslint.js .`（0 error）、`git diff --check` 通过，修改范围受控。

VERIFICATION:

1. 运行新增的回执回归脚本（建议 CDP 端口 9449，避开与 CM-004/006 重复的 9446 和动态端口范围的 9445；HTTP 8899 串行）。
2. 运行既有 `tools/e2e.mjs`、`tools/cooldown.mjs`、`tools/input-safety.mjs`、`tools/button-ids.mjs`、`CM003_CDP_PORT=<空闲端口> node tools/storage-resilience.mjs`、`tools/history-language.mjs`。
3. 运行 `node tools/check-worktree.mjs`、`node node_modules/eslint/bin/eslint.js .`、`git diff --check`，检查完整 diff 与实际修改范围。

BRANCH:

从本地 `main` 的**当前最新稳定 HEAD** 创建并使用：`codex/cm008-receipt-lifecycle`。外部 AI 开工前必须用 `git rev-parse --short HEAD` 确认（截至本任务卡定稿为合并 CM-007 后的 main；若其后仅有 docs-only 提交，直接用最新 HEAD）。

注意：本机存在「checkout/merge 触发工作区级联丢失」环境缺陷（详见 `docs/handoff/archive/WORKTREE-FILE-LOSS.md` 与 `CM-007.md` 事故记录）。**创建分支或切换分支后必须立即运行 `node tools/check-worktree.mjs`**；若已跟踪文件缺失，先确认非有意删除，再 `git restore -- <路径>` 恢复，不得把缺失当作删除提交。

## EXECUTION STATUS

```text
状态：DISPATCHED — 等待外部 Execution AI 接受并执行
任务分支：codex/cm008-receipt-lifecycle（尚未创建；分支点 = main 当前最新 HEAD，开工前用 git rev-parse 确认）
当前工作分支：main
main：已合并 CM-007（1bedcab..26f52fb 快进），合并后复验 history-language 107/0、input-safety 97/0、check-worktree 缺失 0
main 与 origin/main：本地领先（未推送——无推送授权）
工作区：干净；已跟踪文件缺失 0
```

## EXECUTION REPORT

等待外部 AI 按任务卡执行。外部 AI 完成后必须写入修改文件、实现摘要、测试命令、完整结果、退出码、已知问题和 commit；报告不等于主 AI 验收通过。

## REVIEW RESULT

CM-007：**PASS**（2026-09-19）。

- Diff 审查：8 文件全部在 SCOPE 内；`language.js` 存在性判断正确，首页行为不变；翻译键四语言齐全；zh `webhookLabel` 保持 `Webhook` 与 CM-005 断言兼容。
- 独立复跑全部 10 项验证与执行 AI 报告一致（history-language 107/0、negative 65/42 区分力、input-safety 97/0、cooldown 87/0、button-ids 52/0、storage-resilience 51/0、e2e 29/0、lint 0 error/1 既有 warning、diff-check 0、check-worktree 0 缺失）。
- 已快进合并 `1bedcab..26f52fb` 并完成合并后复验。
- 事故记录：合并时 `tools/` 14 个文件被沙箱级联搬入回收站（防线脚本同时失效），`git restore -- tools/` 全部恢复，零数据丢失；详见 `docs/handoff/archive/CM-007.md`。
- 完整验收与事故记录已归档：`docs/handoff/archive/CM-007.md`。

CM-008：尚未验收。

## NEXT ACTION

外部 AI 请读取最新的 `AGENTS.md` 和本文件，用 `git rev-parse --short HEAD` 确认实际 HEAD 后创建 `codex/cm008-receipt-lifecycle`（**创建/切换分支后立即跑 `node tools/check-worktree.mjs`**），按 `CURRENT TASK` 执行。完成后更新本文件的 `EXECUTION STATUS` 和 `EXECUTION REPORT`，等待主 AI 独立验收。不要修改或合并 `main`。
