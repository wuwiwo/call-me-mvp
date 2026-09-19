# AI 协作通信文档

本文件是主 AI 与外部 Execution AI 的当前通信面板。只保留当前任务、当前状态、当前报告、当前验收和下一步；历史记录见 [`docs/handoff/archive/INDEX.md`](handoff/archive/INDEX.md)。

## CURRENT TASK

CM-001-TD-08 — 修复 error 通知音效静默失败

PHASE: BugFix
PRIORITY: P2

OBJECTIVE:

修复 `soundManager.playNotificationSound(false)` 访问未配置的 `CONFIG.soundEffects.notifications.error` 导致的静默失败。
现状：`sounds.js:50-52` 的 `playNotificationSound(isSuccess)` 里 `type = isSuccess ? 'success' : 'error'`，
然后 `this.play(CONFIG.soundEffects.notifications[type])`。但 `config.js` 的 `notifications` 只有 `success`，
**没有 `error`** → `isSuccess=false` 时 `play(undefined)` → `audioCache.get(undefined)` → undefined → 静默不播放。
调用方 `notification.js:39` 在 5 处错误/警告场景（初始化失败、输入校验失败、冷却限制等）传入 `false`，用户听不到任何反馈。

方案（Human 已拍板 C）：新增 error 音效文件 + config 配置。
**音效文件已由主 AI 准备并提交到 main**：`sounds/error-notification.wav`（200+150Hz 双频蜂鸣，0.35 秒，16-bit PCM mono，30912 bytes）。

CONTEXT:

- `js/modules/config.js:51-53`：`notifications: { success: "sounds/success-notification.wav" }` —— 缺 `error`
- `js/modules/sounds.js:50-53`：`playNotificationSound(isSuccess)` → `this.play(CONFIG.soundEffects.notifications[type])` —— 无防御性检查
- `js/modules/notification.js:39`：`soundManager.playNotificationSound(isSuccess)` —— 唯一调用方
- 调用 `show(message, false)` 的 5 处：`main.js:146`、`profile.js:116`、`buttonManager.js:260,437,791`
- 音效资源目录 `sounds/` 现有 8 个文件（含新增 `error-notification.wav`）

SCOPE:

- `js/modules/config.js`：在 `notifications` 对象里加 `error: "sounds/error-notification.wav"`（与 `success` 同级，字段名 `error`）
- `js/modules/sounds.js`：`playNotificationSound(isSuccess)` 加防御性检查 —— 当 `CONFIG.soundEffects.notifications[type]` 不存在时直接 return（不传 undefined 给 `play()`），避免未来配置缺失时静默失败

NON-GOALS:

- 不改 `notification.js` 的调用方（`show` / `sendNotification` 的 `isSuccess` 语义不变）
- 不改 avatar 音效（`playAvatarSound` 路径不动）
- 不改 `play(url)` 的核心逻辑（`audioCache` / `audio.play()` 不动）
- 不加新音效功能、不改 `preload()` 逻辑（`preload` 已遍历 `Object.values(notifications)`，加 `error` 后会自动预加载）
- 不改 `soundManager.enabled` / `toggle()` 全局开关
- 不动 AGENTS.md（主 AI 自己同步）

IMPLEMENTATION REQUIREMENTS:

1. `config.js` 的 `notifications` 对象加 `error: "sounds/error-notification.wav"`，与 `success` 同级，注释标注用途。
2. `sounds.js` 的 `playNotificationSound(isSuccess)` 在取 `type` 后、调 `this.play()` 前，检查 `CONFIG.soundEffects.notifications[type]` 是否存在；不存在时直接 return（不传 undefined）。
3. `preload()` 不需要改 —— 它已用 `Object.values(CONFIG.soundEffects.notifications)` 遍历，加 `error` 后自动预加载。
4. 行为不变：`playNotificationSound(true)` 仍播放 `success-notification.wav`；`playNotificationSound(false)` 从静默失败变为播放 `error-notification.wav`。

ACCEPTANCE CRITERIA:

- [ ] `config.js` 的 `notifications` 有 `success` 和 `error` 两个键，`error` 指向 `sounds/error-notification.wav`。
- [ ] `sounds.js` 的 `playNotificationSound` 在配置缺失时不传 undefined 给 `play()`（防御性检查）。
- [ ] `playNotificationSound(false)` 播放 `error-notification.wav`（可通过 `audioCache` 验证有缓存条目）。
- [ ] `playNotificationSound(true)` 行为不变（播放 `success-notification.wav`）。
- [ ] `preload()` 预加载 `error-notification.wav`（`Object.values` 自动包含）。
- [ ] lint 0 error、`git diff --check` 0、check-worktree 缺失 0。
- [ ] `node tools/run-all.mjs` 全量 10/10 通过（537 项断言 0 失败，既有套件不回归）。

VERIFICATION:

1. `node tools/run-all.mjs` 全量。
2. `node node_modules/eslint/bin/eslint.js .`、`git diff --check`、`node tools/check-worktree.mjs`。
3. 手工/页面级验证（可选）：`soundManager.playNotificationSound(false)` 在浏览器控制台调用后 `audioCache` 有 `sounds/error-notification.wav` 条目。

BRANCH:

从本地 `main` 的当前最新稳定 HEAD `e00b086` 创建并使用：`codex/cm011-error-sound`。开工前必须 `git rev-parse --short HEAD` 实测确认。

注意：本机存在「checkout/merge 触发工作区级联丢失」环境缺陷。**创建/切换分支后必须立即运行 `node tools/check-worktree.mjs`**；若已跟踪文件缺失，先确认非有意删除，再 `git restore -- <路径>` 恢复。守卫已移出 `tools/` 到 `scripts/` + `.git/`（GOV-002），cherry-pick 实测能自动恢复级联误伤。**验收前不得合并 main、不得 push**。

## EXECUTION STATUS

```text
状态：DISPATCHED — 任务卡已写入，等待外部 AI 执行
任务分支：codex/cm011-error-sound（待外部 AI 创建）
任务基线：e00b086（main 当前 HEAD）
主 AI 已准备资源：sounds/error-notification.wav（已提交到 main）
```

## EXECUTION REPORT

（外部 AI 完成后填写）

## REVIEW RESULT

**CM-010：CONDITIONAL PASS**（已完成合并 + 同步 + 归档 + push）。详见 [`docs/handoff/archive/CM-010.md`](handoff/archive/CM-010.md)。

**GOV-002：PASS**（已完成 cherry-pick 合并 + 同步 + 归档 + push）。详见 [`docs/handoff/archive/GOV-002.md`](handoff/archive/GOV-002.md)。

**文档 666888 清理：PASS**（已完成 + push）。9 处文档明文密码改为指向 `config.js` 单一来源；grep 验证文档 0 命中。

## NEXT ACTION

外部 AI 请读取最新的 `AGENTS.md` 和本文件，用 `git rev-parse --short HEAD` 确认实际 HEAD（应为 `e00b086`）后创建 `codex/cm011-error-sound`（**创建/切换分支后立即跑 `node tools/check-worktree.mjs`**），按 `CURRENT TASK` 执行。完成后更新本文件的 `EXECUTION STATUS` 和 `EXECUTION REPORT`，等待主 AI 独立验收。**不要修改或合并 `main`，不要 push。**
