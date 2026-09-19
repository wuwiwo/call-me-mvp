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
任务卡初始派发提交：`9d70c40`。外部 AI 开工前仍必须用 `git rev-parse --short HEAD` 确认当前稳定 HEAD，并从该基线创建任务分支；不要直接修改或合并 `main`。

## EXECUTION STATUS

```text
状态：PASS — CM-006 已通过主 AI 独立验收，等待 Human 合并门禁
任务分支：codex/cm006-cooldown-ownership
任务基线：37b496d（实测 HEAD；任务卡记的是 9d70c40，说明见下）
当前工作分支：codex/cm006-cooldown-ownership
main：未被修改（本任务全部提交都在任务分支上）
工作区：干净；tools/check-worktree.mjs 退出码 0；已跟踪文件缺失 0

本任务提交：
  f7de784  refactor: cooldown 收敛为单一责任者（countdown）
  56114c4  test: 新增 cooldown 单一责任回归与反向验证
  acbf8f9  docs: 登记 CM-006 验证工具与 cooldown 责任说明
  （另有 1 个面板回填提交，见 git log）

CM-005 / GOV-001 / 工作区完整性防线：均已合并并推送
```

**关于基线的一处说明**：任务卡 `BRANCH` 段要求「外部 AI 开工前仍必须用
`git rev-parse --short HEAD` 确认当前稳定 HEAD，并从该基线创建任务分支」。
实测 HEAD = `37b496d`（提交信息为「docs: 固定 CM-006 任务基线」），
它是 `9d70c40` 的子提交且只改了本文件 —— 即主 AI 用来回填基线的那个提交。
为满足「任务卡写在 A、提交后 HEAD 变成 B」的防歧义要求，从**实测稳定 HEAD**
`37b496d` 创建分支，而非任务卡正文记的派发提交号 `9d70c40`。

## EXECUTION REPORT

> 报告不等于主 AI 验收通过。以下命令与输出均为本机实跑结果，可直接复跑复核。

### 一、修改文件

| 文件 | 改动 |
|---|---|
| `js/modules/countdown.js` | 重写为 cooldown **唯一责任者**（状态转换 + 持久化 + timer + 显示） |
| `js/modules/state.js` | 删除 `checkCooldownStatus()` 与 `init()` 中的调用；移除已无用的 `CONFIG` 导入 |
| `js/main.js` | 删除重复的 `checkCooldown()`；改为在 `countdown.init()` 后调用 `countdown.restore()` |
| `js/modules/buttonManager.js` | 点击路径改为调用责任者接口；不再自行写 `lastClickTime` / `canClick` |
| `js/modules/notification.js` | 删除对 `lastClickTime` 的重复写入 |
| `tools/cooldown.mjs` | **新增**：CM-006 回归脚本（87 项断言） |
| `tools/negative-cooldown.mjs` | **新增**：反向验证脚本 |
| `tools/README.md` | 登记两个新工具 + CM-006 环境变量/验收路径/时间戳定义行为 |
| `README.md` | 修正因本次改动失效的 2 行模块 API（范围外，已单独列出） |

### 二、实现摘要

**唯一责任者 = `js/modules/countdown.js`**，独占三件事：冷却状态转换（`state.canClick`）、
`lastClickTime` 持久化、倒计时 timer 生命周期。

> 为什么不是 `state.js`：它在**模块导入期**就执行，早于 DOM 就绪与 `countdown.init()`；
> 若由它承担恢复逻辑，就需要反向导入 `countdown` 来驱动显示，形成 `state ⇄ countdown`
> 循环依赖。放在 `countdown` 可保持依赖单向（`countdown → state`），也无需引入新模块或抽象。

对外接口：`restore()` / `startFromNow()` / `cancel()` / `remaining()`（+ `init()` / `updateDisplay()`）。

**消除的重复**（收敛前 → 收敛后）：

| 项 | 收敛前 | 收敛后 |
|---|---|---|
| `lastClickTime` 写入方 | `buttonManager` + `notification`（各一次，时间戳差一个调用间隔） | 仅 `countdown` |
| `state.canClick` 写入方 | `state` / `main` / `countdown` / `buttonManager` | 仅 `countdown` |
| 剩余时间计算 | `state` / `main` / `buttonManager` 各一份 | 仅 `countdown.remaining()` |
| 计时器数量（一次冷却） | **3 个**（2 个不可取消 `setTimeout` + 1 个 `setInterval`） | **1 个**（可取消 `setInterval`） |
| 防旧 timer 覆盖新状态 | 无任何机制 | 代际标记 `generation`，旧代回调一律忽略 |

**新增的一条定义行为 —— 未来时间戳 clamp**：`lastClickTime` 落在未来（时钟回拨/被篡改）时，
剩余时间 clamp 到 `CONFIG.cooldownTime`。旧实现会算出 `60 + 偏移量` 并直接启动倒计时，
实测显示为 `"冷却中，3660秒后可再次发送"` —— 时钟被向前校正一小时后用户会被锁死约 61 分钟。

### 三、测试结果（全部实跑）

**1) CM-006 回归（新增）**

```text
node tools/cooldown.mjs
→ 断言：87 passed, 0 failed      退出码 0
  环境：Chrome/153.0.8010.50（headless，CDP 9446）
  S1 首次加载 / S2 刷新恢复 / S3 归零 / S4 请求成功 / S5 重复点击
  S6 失败回滚（含重试成功重新进入冷却）/ S7 七种非法时间戳 / S8 过期
  S9 未来时间戳 clamp / S10 timer 去重 / S11 代际守卫 / S12 页面异常
  S13 五个源码的写入点同源性扫描
  预期内的页面错误 1 条（失败回滚场景故意让 fetch 抛错，应用自身 catch 记录）
```

观测手段**不在生产代码里留任何测试钩子**：页面内 `await import('/js/modules/state.js')`
取到应用正在使用的同一模块实例（ESM 记录按 URL 缓存）直接读真实状态；
CDP `addScriptToEvaluateOnNewDocument` 在页面脚本之前包装定时器 API；
fetch 桩模拟成功/失败，**全程离线，无真实外部请求**。

**2) CM-006 反向验证（新增）**

```text
node tools/negative-cooldown.mjs
→ 已收敛版本：87 passed / 0 failed，退出码 0
  回退版本  ：65 passed / 22 failed，退出码 1
  源码已还原：true（finally 中逐文件比对磁盘与备份，一致）
  结果：通过 —— 对「写入点分散」与「重复定时器」均有区分力
```

回退版关键证据：

```text
FAIL 未创建长延时 timeout（旧实现的恢复定时器） -> longTimeouts=2
FAIL 显示文本为 60 秒且未出现 3660 -> "冷却中，3660秒后可再次发送"
FAIL 仅 countdown 触碰 lastClickTime key
     state.js keyRefs=6 canClickAssign=4 setTimeout=1
     main.js  keyRefs=4 canClickAssign=2 setTimeout=1
     buttonManager.js keyRefs=7 canClickAssign=3 setTimeout=1
     notification.js  keyRefs=1 canClickAssign=0 setTimeout=4
     countdown.js     keyRefs=1 canClickAssign=2 setTimeout=0
FAIL 责任者提供 restore / startFromNow 接口 -> countdown.restore is not a function
```

`longTimeouts=2` 是**重复定时器的直接观测**，不是推断。

**3) 非回归（既有套件）**

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/input-safety.mjs` | 97 passed / 0 failed | 0 |
| `node tools/e2e.mjs` | 29 passed / 0 failed | 0 |
| `node tools/button-ids.mjs` | 52 passed / 0 failed | 0 |
| `node tools/storage-resilience.mjs` | 51 passed / 0 failed | 0 |

四个套件默认都用 8899 端口，**串行执行**。`e2e.mjs` / `input-safety.mjs` 的
「全流程无未捕获异常 / console.error」断言均通过。

**4) 其他检查**

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/check-worktree.mjs` | 未发现被删除的已跟踪文件 | 0 |
| `git diff --check` | 无空白错误 | 0 |
| `node node_modules/eslint/bin/eslint.js .` | **0 error / 1 warning**（见已知问题） | 0 |

> lint 用真实入口而非 `npm run lint`：本机 `node_modules/.bin/*` 是 POSIX shim，
> 依赖 `dirname`，在本机必然失败（`dirname: command not found`）。
> 这与 CM-003 报告中的记录一致。

### 四、已知问题与范围外发现（**未擅自修复**）

1. **`tools/worktree-guard.mjs:117` 的 lint warning**（`catch (e)` 的 `e` 未使用）。
   该文件属 GOV-001 防线，**不是 CM-006 引入的**（本分支未修改它），
   它的存在使 lint 从「0 warning」变成「1 warning」。
   按 AGENTS.md「不顺手修复未纳入任务的问题」，**仅报告，未修**。
   建议单独一次提交把 `catch (e)` 改为 `catch`。

2. **`README.md` 的 2 行 API 修正属范围外**。任务卡 SCOPE 未含根 README，
   但它记录的 `countdown`（`start()`/`stop()`）与 `state`（`checkCooldownStatus()`）
   因本次改动失效。不修会让文档与实现矛盾，故做了**最小事实性修正**
   （2 行 + 1 段注解），并在提交 `acbf8f9` 中单独说明。请主 AI 判断是否接受。

3. **审计文档仍描述收敛前的流程**（未修改，属主 AI 的审计基线）：
   - `docs/DATA_FLOW.md:21` `checkCooldown()` 启动步骤 —— 该方法已删除
   - `docs/DATA_FLOW.md:53` 「失败时 stop countdown、恢复 canClick、删除 lastClickTime」—— 现为 `countdown.cancel()`
   - `docs/DATA_FLOW.md:56` 「`notification.sendNotification()` 内部还会再次写 `lastClickTime`」—— **已不成立**
   - `docs/DATA_FLOW.md:70` 「刷新 → `state.init/checkCooldownStatus` + `main.checkCooldown` 恢复状态」—— 现为 `countdown.restore()`
   - `docs/DATA_FLOW.md:73` 「`state.js`、`main.js`、`buttonManager.js`、`notification.js` 都参与状态或时间戳操作」—— **已不成立**
   - `docs/ARCHITECTURE.md:60` 同上的分散描述 —— **已不成立**
   - `docs/TECH_DEBT.md:49-57` CM-001-TD-05 —— **已解决**，可考虑标记关闭

4. **一处不可见的显示变化**（已确认无视觉影响）：`cancel()` 会把倒计时文本清空，
   而旧实现只停 timer 不清文本。`index.css:291-300` 显示 `.countdown` 在无 `.active`
   时 `opacity: 0; height: 0; overflow: hidden`，两条路径下元素都不可见，
   因此**页面视觉结构未变**。

### 五、未执行的验证

- 未在 `history.html` 上验证 —— 该页面不加载 `main.js` / `countdown.js`，与冷却无关。
- 未做真实 webhook 端到端发送 —— 为避免外部副作用，回归脚本用 fetch 桩覆盖成功/失败
  两条路径；真实 webhook 的行为由既有 `tools/e2e.mjs` 间接覆盖（其断言全绿）。

## REVIEW RESULT

CM-005：PASS。GOV-001 和工作区文件完整性防线：已完成并验证。

CM-006：PASS。

主 AI 独立验收记录（2026-09-19）：

- `node tools/cooldown.mjs`：87 passed / 0 failed，退出码 0。
- `node tools/negative-cooldown.mjs`：收敛版退出码 0；回退版退出码 1，命中写入点分散和重复 timer 失败，源码已还原。
- `node tools/input-safety.mjs`：97 passed / 0 failed。
- `node tools/button-ids.mjs`：52 passed / 0 failed。
- `node tools/storage-resilience.mjs`：51 passed / 0 failed。
- `node tools/e2e.mjs`：29 passed / 0 failed。
- `node tools/check-worktree.mjs`：通过，已跟踪文件缺失数 0。
- `npm run lint`：退出码 0；1 个 warning 来自本任务未修改的 `tools/worktree-guard.mjs`，属于既有基线问题。
- `git diff --check`：通过。
- 源码复核确认：`countdown.js` 是唯一 cooldown 责任者；其他模块不再写入 `lastClickTime` 或转换 `state.canClick`；恢复、归零、失败回滚、重复启动和旧 timer 代际保护均有覆盖。
- `README.md` 的 API 表格是与本次公开接口变更直接相关的最小事实性文档修正，接受为相关文档变更；未发现其他范围外业务修改。

## NEXT ACTION

CM-006 已通过验收。下一步等待 Human 明确授权合并 `codex/cm006-cooldown-ownership`；合并后必须在 `main` 上重新运行 cooldown、完整性检查和既有关键回归，再决定是否推送。合并前不要派发 CM-007，也不要修改或合并 `main`。
