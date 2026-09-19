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
状态：READY_FOR_REVIEW — CM-001-TD-08 已实施完成并通过本地验证，等待主 AI 独立验收
任务分支：codex/cm011-error-sound
任务基线：febe3b4（实测 HEAD）
          任务卡写 e00b086，但实测 e00b086..febe3b4 仅改 docs/AI_HANDOFF.md（docs-only），
          按任务卡「若其后仅有 docs-only 提交，直接用最新 HEAD」的规则取自 febe3b4
当前工作分支：codex/cm011-error-sound
main：未被修改（提交都在任务分支上）；本任务未 push
工作区：干净；check-worktree 缺失 0（建分支后立即复核）

本任务提交：
  3914a25  fix: 补上缺失的 error 通知音效配置
  95d794a  fix: playNotificationSound 增加配置缺失的防御性检查

改动范围：2 个文件（js/modules/config.js、js/modules/sounds.js），全部在 SCOPE 内
```

## EXECUTION REPORT

> 报告不等于主 AI 验收通过。以下命令与输出均为本机实跑结果，可直接复跑复核。

### 一、修改文件

| 文件 | 改动 |
|---|---|
| `js/modules/config.js` | `soundEffects.notifications` 增加 `error: "sounds/error-notification.wav"`（与 `success` 同级，含用途注释） |
| `js/modules/sounds.js` | `playNotificationSound(isSuccess)` 增加防御性检查：URL 不存在时打印可定位的 `console.warn` 并 return，不再把 `undefined` 传给 `play()` |

### 二、实现摘要

**缺陷本体**：`playNotificationSound(false)` 取 `notifications['error']` → `undefined`
→ `play(undefined)` → `audioCache.get(undefined)` → `undefined` → **静默什么都不做**，
且没有任何提示。5 处错误/警告场景（初始化失败、输入校验失败、冷却限制等）都受影响。

**两半修复**（对应两个提交）：

1. **补配置**：`config.js` 加上 `error` 条目。`preload()` 用
   `Object.values(notifications)` 遍历，因此**自动**预加载新文件 —— 按 NON-GOALS 未改动 `preload()`。
2. **加防御**：即使将来再漏配某个通知音效，也不要静默消失。
   在取 `type` 之后、`this.play()` 之前检查 URL 是否存在；不存在则
   `console.warn('音效未配置：soundEffects.notifications.<type>')` 并直接 return。

未改：`notification.js` 的调用方与 `isSuccess` 语义、`play(url)` 核心逻辑、
`preload()`、avatar 音效路径、`soundManager.enabled` / `toggle()`。

### 三、测试结果（全部实跑）

**1) 页面级验证（AC 的验证项 3，14 项断言）**

```text
node .workbuddy/cm011_page_verify.mjs
→ 断言：14 passed, 0 failed    退出码 0
```

覆盖（真实浏览器 + 真实页面，走 `main.js` 的真实初始化）：

```text
PASS  notifications 同时含 success 与 error
PASS  error 指向 sounds/error-notification.wav
PASS  success 未被改动
PASS  Object.values(notifications) 含 error（preload 会自动覆盖）
PASS  playNotificationSound(true)  → 交给 play() 的是 success 文件
PASS  ★ playNotificationSound(false) → 交给 play() 的是 error 文件
PASS  ★ 配置缺失时不调用 play()（未传 undefined）
PASS  配置缺失时不抛异常
PASS  配置缺失时给出可定位的警告
PASS  测试后配置已还原
PASS  audioCache 含 success 通知音效
PASS  audioCache 含 error 通知音效
PASS  audioCache 不含 undefined 键
PASS  全流程无未捕获异常 / console.error
```

观测方式：在页面里包一层 `soundManager.play()` **只记录参数**，不改生产代码；
`audioCache` 是实例公有属性，直接读它的键即可验证预加载。

> 该脚本是**一次性证据工具**，放在 `.workbuddy/`（gitignore、不入库）——
> 任务卡 SCOPE 只列了 2 个源文件、AC 也未要求新增入库套件，故未擅自新增。
> 复现：`node .workbuddy/cm011_page_verify.mjs`（脚本仍在工作区，未随提交入库）。

**2) 反向验证（证明上面 14 项有区分力）**

```text
python .workbuddy/cm011_negative.py
→ 已改造版本：14 passed / 0 failed，退出码 0
  回退版本  ：7 passed / 7 failed，退出码 1
  源码已还原：True（比对备份后一致）
  命中修复点关键字的失败项：5 条
```

回退版关键证据 —— **直接复现了缺陷本体**：

```text
FAIL  ★ playNotificationSound(false) → 交给 play() 的是 error 文件 -> [null]
FAIL  ★ 配置缺失时不调用 play()（未传 undefined） -> [null]
FAIL  notifications 同时含 success 与 error -> ["success"]
FAIL  error 指向 sounds/error-notification.wav -> undefined
FAIL  audioCache 含 error 通知音效 -> [只有 6 个 avatar + success]
```

`[null]` 就是 `play(undefined)`（JSON 把 `undefined` 序列化成 `null`）——
即"静默失败"的原始形态。

**3) 统一入口全量**

```text
node tools/run-all.mjs
→ 模式：完整（10 项）；10/10 通过；合计 537 项断言，失败 0；225.4s；退出码 0
```

既有 8 个套件断言数（29/51/52/97/87/107/54/60）**与本任务前完全一致**，无回归。

**4) 其他检查**

| 检查 | 结果 | 退出码 |
|---|---|---|
| `node node_modules/eslint/bin/eslint.js .` | **0 problems**（连此前那条 `worktree-guard.mjs` warning 也已消失） | 0 |
| `node tools/check-worktree.mjs` | 未发现被删除的已跟踪文件 | 0 |
| `git diff --check` | 无空白错误 | 0 |
| 改动范围 | 2 文件，全在 SCOPE 内 | — |

### 四、已知问题与说明

1. **AC 第 6 项写的是「lint 0 error」，实测是「0 problems」** ——
   连之前那条 `tools/worktree-guard.mjs:117` 的 warning 也没有了
   （该文件已随 GOV-002 移到 `scripts/` 并被主 AI 同步过 eslint 配置，warning 一并消失）。
   比验收项要求更好，无风险。

2. **未新增入库测试套件**：任务卡 SCOPE 只列 2 个源文件，AC 未要求套件，
   验证项 3 标注为"可选"。我用一次性页面级脚本产出了可复核证据，但**它不入库**，
   因此仓库里没有针对本缺陷的**长期**回归能力。
   若主 AI 认为值得固化成 `tools/` 下的正式套件（比如并入 `e2e.mjs` 或新建一个），
   请派发后续任务 —— 我没有擅自扩大 SCOPE。

3. **提交信息重做记录**：首轮两个提交的信息里 `"sounds/..."` 的双引号被 shell/Python
   转义吃掉，出现 `\sounds/error-notification.wav\` 这样的残留。
   因两个提交都在本地、未推送，已用 `reset --soft` + 重写信息文件重做
   （现为 `3914a25` / `95d794a`，已复查无反斜杠残留）。**未触碰 main。**

### 五、未执行的验证

- **未做"真听声音"的人工验证**：页面级验证确认的是 `play()` 收到了正确的 URL 且
  `audioCache` 有条目，没有验证实际出声（headless 环境无法人工听）。
  音频文件本身（`sounds/error-notification.wav`，30912 bytes）由主 AI 准备，
  我未校验其内容是否为预期的双频蜂鸣。
- **未在真实交互路径上触发**：5 处 `show(message, false)` 调用点
  （`main.js:146`、`profile.js:116`、`buttonManager.js:260,437,791`）未逐个走真实 UI 触发，
  验证是在页面内直接调 `soundManager.playNotificationSound(false)`。
  由于 `notification.js:39` 是唯一调用方且本任务未改它，调用链未变化。

## REVIEW RESULT

**CM-001-TD-08：PASS**（2026-09-19，主 AI 独立验收）。

7 项验收项全过：

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | config.js 的 notifications 有 success 和 error 两个键 | ✅ | diff：`error: "sounds/error-notification.wav"` 与 `success` 同级 + 用途注释 |
| 2 | sounds.js 防御性检查（不传 undefined 给 play） | ✅ | diff：`if (!url) { console.warn(...); return; }` 在 `this.play(url)` 前 |
| 3 | playNotificationSound(false) 播放 error 音效 | ✅ | 页面级 14 项断言：play() 收到 error 文件 URL + audioCache 含 error 条目 |
| 4 | playNotificationSound(true) 行为不变 | ✅ | 页面级断言：play() 收到 success 文件 URL + success 未被改动 |
| 5 | preload() 预加载 error 音效 | ✅ | 页面级断言：audioCache 含 error 条目（Object.values 自动包含） |
| 6 | lint 0 error / git diff --check 0 / check-worktree 缺失 0 | ✅ | 实测：lint 0 problems（比要求更好）/ diff --check 0 / check-worktree 0 |
| 7 | run-all 全量 10/10 不回归 | ✅ | 537 项断言 0 失败；既有 8 套件断言数 29/51/52/97/87/107/54/60 不变 |

独立复跑：
- 页面级验证 14/0（★ playNotificationSound(false) → play() 收到 error 文件 URL；★ 配置缺失时不调用 play()；audioCache 含 error 条目 + 不含 undefined 键）
- 反向验证：已改造 14/0 vs 回退 7/7；回退版直接复现缺陷本体（`play(undefined)` → `[null]` 静默失败）；源码已还原 true
- run-all 全量 10/10，537 项断言 0 失败

三处自陈说明裁决：
1. AC 第 6 项写「lint 0 error」实测「0 problems」—— 比要求更好（GOV-002 同步 eslint 配置后 worktree-guard.mjs warning 也消失），无风险 ✅
2. 未新增入库测试套件——任务卡 SCOPE 只列 2 源文件，AC 未要求套件，验证项 3 标注"可选"。一次性脚本在 .workbuddy/ 不入库。正确判断，未擅自扩大 SCOPE ✅
3. 提交信息重做记录——首轮双引号被 shell 转义吃掉，用 reset --soft 重写。已复查无反斜杠残留 ✅

主 AI 不要求固化成正式套件：小修复（2 行 config + 10 行防御性检查），页面级一次性脚本已充分验证，run-all 全量不回归。固化成正式套件的边际价值低。

- 完整记录：`docs/handoff/archive/CM-001-TD-08.md`（合并后归档）。

---

**CM-010：CONDITIONAL PASS**（已完成合并 + 同步 + 归档 + push）。详见 [`docs/handoff/archive/CM-010.md`](handoff/archive/CM-010.md)。

**GOV-002：PASS**（已完成 cherry-pick 合并 + 同步 + 归档 + push）。详见 [`docs/handoff/archive/GOV-002.md`](handoff/archive/GOV-002.md)。

**文档 666888 清理：PASS**（已完成 + push）。9 处文档明文密码改为指向 `config.js` 单一来源；grep 验证文档 0 命中。

## NEXT ACTION

外部 AI 请读取最新的 `AGENTS.md` 和本文件，用 `git rev-parse --short HEAD` 确认实际 HEAD（应为 `e00b086`）后创建 `codex/cm011-error-sound`（**创建/切换分支后立即跑 `node tools/check-worktree.mjs`**），按 `CURRENT TASK` 执行。完成后更新本文件的 `EXECUTION STATUS` 和 `EXECUTION REPORT`，等待主 AI 独立验收。**不要修改或合并 `main`，不要 push。**
