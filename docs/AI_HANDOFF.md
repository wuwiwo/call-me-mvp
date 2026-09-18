# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；已完成任务的完整过程见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

CM-005 — 消除动态用户输入 HTML 注入

PHASE: BugFix / Security
PRIORITY: P1

OBJECTIVE:

确保昵称、按钮文字、历史字段等用户可控数据以文本安全渲染，不被当作 HTML 或脚本执行，同时保持现有页面结构和产品行为。

SCOPE:

- `js/modules/buttonManager.js`
- `js/modules/history.js`
- `tools/input-safety.mjs`、`tools/negative-input-safety.mjs` 及相关说明
- 本通信文档

NON-GOALS:

- 不引入框架、构建步骤、后端、CSP 或新的运行时依赖。
- 不改变 LocalStorage key、按钮/历史数据格式、按钮上限或页面视觉结构。
- 不处理按钮 ID、LocalStorage 容错、冷却、回执、语言或格式化基线问题。

ACCEPTANCE CRITERIA:

- [ ] 恶意昵称、按钮文字、历史字段只作为文本显示，不执行 HTML、script、事件属性或结构注入。
- [ ] 编辑表单的文本 value、图标预览和回显不破坏 DOM。
- [ ] icon 严格受 `CONFIG.buttons.availableIcons` 与 `random` 允许列表约束；未知历史值安全显示且不被无意丢失。
- [ ] 历史状态、字段缺失和未知字段不会突破 DOM；既有 success/error 行为不回归。
- [ ] 新增、编辑、删除、保存、刷新、历史渲染和按钮点击行为保持正常。
- [ ] 恶意输入回归脚本可复跑并记录准确断言数、结果和退出码。
- [ ] `npm run lint`、`git diff --check` 通过，且修改范围受控。

VERIFICATION:

1. 外部 AI 完成返工后更新本文件的 `EXECUTION STATUS` 与 `EXECUTION REPORT`。
2. 主 AI 独立检查 CM-005 分支 diff 和关键源码。
3. 主 AI 独立运行 `tools/input-safety.mjs`、`tools/negative-input-safety.mjs`、`tools/button-ids.mjs`、`tools/storage-resilience.mjs`、`tools/e2e.mjs`、`npm run lint` 和 `git diff --check`。

## EXECUTION STATUS

```text
状态：MERGED — CM-005 已通过验收，已合并进 main 并推送
任务分支：codex/cm005-input-safety（已合并，待清理）
任务基线：ddff168
合并后 main：745b8d3（= origin/main，已核对一致）
当前工作分支：main
Human 已授权「合并后推送」（2026-09-18）；外部 AI 执行快进合并与推送，
未修改任何业务代码。合并记录详见归档 `docs/handoff/archive/CM-005.md`。
```

## EXECUTION REPORT

CM-005 第二轮返工已完成。外部 AI 报告：

- `js/modules/buttonManager.js` 改为严格 icon 允许列表；未知历史 icon 显示回退图标，但保存时保留原始值。
- 回归断言更新为 97 项；反向验证能够同时命中注入类和允许列表类缺陷。
- `node tools/input-safety.mjs`：97 passed / 0 failed，退出码 0。
- `node tools/negative-input-safety.mjs`：修复版 0、回退版 1，退出码 0。
- CM-004 `button-ids.mjs`：52/52；CM-003 `storage-resilience.mjs`：51/51；CM-002 `e2e.mjs`：29/29。
- ESLint：0 error / 0 warning；`git diff --check`：通过。
- 相关提交：`49bff04`、`1f62ee9`、`cf31648`、`6b626f3`、`941b098`。

本轮同时完成 GOV-001 文档拆分：原 1181 行交接文档已完整保存在 `docs/handoff/archive/AI_HANDOFF_LEGACY_2026-09-18.md`，历史任务按索引归档，未删除历史证据。

合并执行（外部 AI，2026-09-18）：`git merge --ff-only`，`ddff168 → 745b8d3`；
推送 `55d2e77..745b8d3`，远端已核对。`main` 与已验收 tip 为**同一 commit**，
故「已验收即已验证」。合并后在 `main` 上复跑：`input-safety` 97/97、lint 0/0 通过。

已知问题（阻塞，需处理）：合并后发现 **17 个已跟踪文件在工作区缺失**
（10 个 `docs/*.md` + 7 个 `tools/*.mjs`，含 CM-002/003/004 全部测试资产）。
HEAD 内容完整、推送不受影响；三次快照稳定，非进行中操作。
按 `AGENTS.md:141` 未做 restore/checkout，保留原状上报。
影响：`button-ids` / `storage-resilience` / `e2e` 三个套件因文件不存在无法本地复跑（`MODULE_NOT_FOUND`）。
同类现象此前已出现两次，均未被任何 commit 删除，建议单开任务排查根因。
详见 `docs/handoff/archive/CM-005.md`。

## REVIEW RESULT

GOV-001 文档治理：PASS。

- `AI_HANDOFF.md` 现在只有一组固定 H2 区块。
- CM-002、CM-003、CM-004 及既有治理记录已迁入归档索引；完整原文快照保留。
- `AGENTS.md` 已明确当前面板、归档目录和读取规则。

CM-005：PASS，可进入 Human 明确授权的合并与推送门禁。

主 AI 独立验收记录（2026-09-18）：

- `node tools/input-safety.mjs`：97 passed / 0 failed，退出码 0。
- `node tools/negative-input-safety.mjs`：修复版退出码 0；回退版退出码 1，命中 17 条注入类和 4 条允许列表类失败，源码已还原。
- `node tools/button-ids.mjs`：52 passed / 0 failed，退出码 0。
- `node tools/storage-resilience.mjs`：51 passed / 0 failed，退出码 0。
- `node tools/e2e.mjs`：29 passed / 0 failed，退出码 0。
- `npm run lint`：0 error / 0 warning，退出码 0。
- `git diff --check`：通过。
- 源码复核确认：用户输入未进入动态 HTML；icon 仅允许配置闭集和 `random`；未知历史 icon 安全回退且原值保留；历史 `_status` 仅允许 `success`/`error`。
- CM-005 任务分支相对 `ddff168` 的业务改动范围为 `buttonManager.js`、`history.js` 和对应验证资产；无业务范围外修改。

## NEXT ACTION

下一步：等待 Human 明确授权合并和推送；获授权后由主 AI 将 `codex/cm005-input-safety` 合并到 `main`，在合并后的 `main` 上重新运行关键验证，再推送并清理任务分支。外部 AI 在此之前保持待命，不要修改或合并 `main`。
