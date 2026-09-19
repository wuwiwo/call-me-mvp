# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

CM-006 — 收敛 cooldown 单一责任并补回归验证

PHASE: Engineering / BugFix
PRIORITY: P1

OBJECTIVE:

收敛冷却状态的读写、倒计时和恢复逻辑，消除 `state`、`main`、`buttonManager`、`notification`、`countdown` 之间的重复写入、重复恢复和重复定时器风险；保持现有 60 秒冷却产品行为。

CONTEXT:

当前 `lastClickTime`、`state.canClick` 和倒计时分别由多个模块参与维护：`state.init/checkCooldownStatus()`、`main.checkCooldown()`、`buttonManager.handleButtonClick()`、`notification.sendNotification()` 和 `countdown.start/stop()`。审计已确认存在重复写入和重复定时器风险，详见 `docs/TECH_DEBT.md`、`docs/ARCHITECTURE.md`、`docs/DATA_FLOW.md`。

SCOPE:

- `js/modules/state.js`
- `js/main.js`
- `js/modules/buttonManager.js`
- `js/modules/notification.js`
- `js/modules/countdown.js`
- 必要的零依赖 cooldown 回归脚本、测试说明和本通信文档

NON-GOALS:

- 不改变 `lastClickTime` LocalStorage key、`CONFIG.cooldownTime` 配置或页面视觉结构。
- 不重做通知、历史、回执、按钮 ID、LocalStorage JSON 容错或用户输入安全。
- 不引入框架、构建步骤、新运行时依赖或大型状态管理抽象。
- 不顺手修复格式化基线、其他定时器或范围外模块问题。

IMPLEMENTATION REQUIREMENTS:

1. 先定义并记录唯一 cooldown 责任者：只有一个模块负责冷却状态转换、`lastClickTime` 持久化和倒计时生命周期；其他模块只能调用明确接口，不能重复写同一状态。
2. 页面初次加载、已有冷却刷新恢复、冷却归零、正常发送失败回滚和重复点击都必须经过同一套状态转换。
3. 同一时刻最多存在一个 cooldown timer；重复初始化或重复 start 不得叠加 interval/timeout，也不得让旧 timer 在新状态之后改写 `state.canClick`。
4. 保持现有行为：默认冷却 60 秒；冷却期间点击被阻止；刷新可恢复剩余时间；通知请求失败仍按当前产品行为解除冷却；合法旧时间戳可继续工作；非法时间戳不会阻断页面。
5. 只保留必要的兼容逻辑；若选择新增接口或模块，必须说明为什么现有模块无法承载，以及如何避免产生第二份状态。

ACCEPTANCE CRITERIA:

- [ ] 代码中 `lastClickTime` 的写入、删除和 `state.canClick` 的冷却转换均由唯一责任者集中管理，其他模块不再重复实现。
- [ ] 页面初始化、刷新恢复、倒计时归零、请求成功、请求失败和重复点击路径行为保持正确。
- [ ] 重复初始化/重复启动不会产生多个 timer；旧 timer 不会覆盖新状态。
- [ ] 冷却期间不会重复发送通知或重复写入冷却起始时间。
- [ ] 缺失、非法、过期和未来时间戳均有明确安全行为并经过测试。
- [ ] 既有 CM-002/003/004/005 行为不回归。
- [ ] 新增 cooldown 回归脚本可复跑，记录准确断言数、环境、退出码和失败项。
- [ ] `npm run lint`、`git diff --check` 通过，且修改范围受控。

VERIFICATION:

1. 运行 `node tools/cooldown.mjs`（或任务中提供的等价脚本），覆盖首次加载、刷新恢复、归零、重复点击、失败回滚、非法时间戳和 timer 去重。
2. 运行 `node tools/check-worktree.mjs`，确认没有已跟踪文件缺失；必要时先恢复再继续，不得把删除固化进提交。
3. 运行已有 `tools/input-safety.mjs`、`tools/button-ids.mjs`、`tools/storage-resilience.mjs`、`tools/e2e.mjs` 和 `npm run lint`。
4. 查看完整 diff，运行 `git diff --check`，报告范围外发现但不擅自修复。

BRANCH:

从当前本地 `main` 的稳定提交创建并使用：`codex/cm006-cooldown-ownership`。
任务卡提交后的实际基线以 `git rev-parse --short HEAD` 核对；本任务卡初始派发提交为 `DISPATCH_COMMIT_PENDING`，完成派发提交后主 AI 会回填真实 hash。不要直接修改或合并 `main`。

## EXECUTION STATUS

```text
状态：DISPATCHED — 等待外部 Execution AI 接受并执行
任务分支：codex/cm006-cooldown-ownership
任务基线：DISPATCH_COMMIT_PENDING（派发提交后回填）
当前工作分支：main
main 与 origin/main：派发前已核对一致，工作区干净，已跟踪文件缺失数 0
CM-005：PASS，已合并并推送
GOV-001 与工作区完整性防线：已合并并推送
```

## EXECUTION REPORT

等待外部 AI 按任务卡执行。外部 AI 完成后必须在本节写入修改文件、实现摘要、测试命令、完整结果、退出码、已知问题和 commit；报告不等于主 AI 验收通过。

## REVIEW RESULT

CM-005：PASS。GOV-001 和工作区文件完整性防线：已完成并验证。

CM-006：尚未验收。

## NEXT ACTION

外部 AI 请读取最新的 `AGENTS.md` 和本文件，确认实际 `HEAD` 后创建 `codex/cm006-cooldown-ownership`，按 `CURRENT TASK` 执行。完成后更新本文件的 `EXECUTION STATUS` 和 `EXECUTION REPORT`，等待主 AI 独立验收。不要修改或合并 `main`。
