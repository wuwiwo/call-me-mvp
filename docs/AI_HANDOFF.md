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
状态：READY_FOR_REVIEW — CM-008 已实施完成并通过本地验证，等待主 AI 独立验收
任务分支：codex/cm008-receipt-lifecycle
任务基线：2dea212（实测 HEAD；任务卡记「合并 CM-007 后的 main」，
          26f52fb..2dea212 经 diff 验证仅 docs-only：AI_HANDOFF + CM-007 归档 + INDEX）
当前工作分支：codex/cm008-receipt-lifecycle
main：未被修改（本任务全部提交都在任务分支上）

分支安全：创建分支后**立即**运行 check-worktree → 缺失 0；之后各次运行前后亦复核，均正常。

本任务提交：
  2f01e57  fix: 回执轮询可取消与单一所有权
  f1786f4  test: 新增回执轮询生命周期回归与反向验证
  e61e71d  docs: 登记 CM-008 验证工具与回执轮询说明
  （另有 1 个面板回填提交，见 git log）
```

## EXECUTION REPORT

> 报告不等于主 AI 验收通过。以下命令与输出均为本机实跑结果，可直接复跑复核。

### 一、修改文件

| 文件 | 改动 |
|---|---|
| `js/modules/notification.js` | 新增 `receiptPollTimer` / `receiptPollGeneration` / `stopReceiptPolling()`；`pollReadStatus()` 改为可取消 + 代际守卫；`setReceiptStatus` 参数改名 |
| `tools/receipt-lifecycle.mjs` | **新增**：CM-008 回归脚本（54 项断言） |
| `tools/negative-receipt-lifecycle.mjs` | **新增**：反向验证脚本（全流程约 4 分钟） |
| `tools/README.md` | 登记两个新工具 + CM-008 环境变量/验收路径 |

### 二、实现摘要

改造前：`pollReadStatus()` 用递归 `setTimeout(poll, 2000)`，**不保存句柄、无取消机制**，
一旦启动最长跑约 32s。两次发送重叠时，旧轮询读到旧 `msgId` 的 read 或走到 timeout，
会把新消息的状态条覆盖掉（TECH_DEBT CM-001-TD-07）。

改造后（做法与 CM-006 `countdown.generation` 一致）：

| 关注点 | 实现 |
|---|---|
| 状态 | `receiptPollTimer`（句柄，null = 无已排队轮询）+ `receiptPollGeneration`（代际） |
| 停止 | `stopReceiptPolling()`：自增代际 + `clearTimeout` + 句柄置 null，**不写状态条** |
| 单一所有权 | `pollReadStatus()` 启动前先 `stopReceiptPolling()` → 同一时刻活跃轮询 ≤ 1 |
| 旧轮询失效 | **三处**代际校验：回调入口、`await fetch` 之后、`await res.json()` 之后 |
| 终态 | read 命中 / 15 次超时：先清句柄再写状态条 |
| 参数遮蔽 | `setReceiptStatus(state)` → `setReceiptStatus(statusName)` |

**两处值得说明的判断**：

1. **刻意不用 AbortController** —— 那会改动既有 JSONBin 读取方式（NON-GOALS）。
   代际校验已足以保证旧轮询不写状态条：在飞的请求返回后被直接丢弃。
2. **`await` 之后的两处重复校验是必需的** —— 这两处是异步边界，
   期间可能有新一次发送接管轮询；只在回调入口校验不足以覆盖。

### 三、测试结果（全部实跑）

**1) CM-008 回归（新增）**

```text
node tools/receipt-lifecycle.mjs
→ 断言：54 passed, 0 failed      退出码 0
  环境：Chrome/153.0.8010.50（headless，CDP 9449，HTTP 8899）
  S0 前置 · S1 单次→read · S2 单次→timeout · S3 并发打断（核心）
  S4 宽容语义 · S5 可取消性 · S6 定时器计数 · S7 同源性 · S8 页面异常
  页面错误 0 条
```

两个核心观测值：

```text
S2：共 15 次 bin 请求、耗时 30-36s      ← 单次节奏与阈值不变
S3：★ 越过后第一次的原超时点，状态条仍为 read
    ★ 旧轮询已停止发请求 → binCalls=3（改造前为 16）
```

**★ 量化「旧轮询真的死了」的思路**：不看定时器计数（易受 toast 等干扰），
而看**旧轮询是否还在发请求** —— 两个轮询并存时，32s 窗口内的 JSONBin 请求数会接近翻倍。
改造后为 3 次（第一次交接前 2 次 + 第二次命中 1 次），改造前 16 次。

**2) CM-008 反向验证（新增）**

```text
node tools/negative-receipt-lifecycle.mjs
→ 已改造版本：54 passed / 0 failed，退出码 0
  回退版本  ：31 passed / 20 failed，退出码 1
  源码已还原：true（finally 中比对磁盘与备份，一致）
  结果：通过 —— 对「轮询不可取消」与「旧轮询覆盖新状态条」均有区分力
```

回退版关键证据（★ 两条的数值与设计预期吻合）：

```text
FAIL  ★ 旧轮询的超时分支未覆盖新状态条（仍为 read） -> receipt-status timeout
FAIL  ★ 旧轮询已停止发请求（bin 请求 ≤ 6）        -> binCalls=16
FAIL  提供 stopReceiptPolling 接口 -> 旧实现没有该接口
FAIL  旧轮询已被失效（代际自增） -> null -> null
FAIL  不再有遮蔽模块 state 的参数名 -> hasShadowParam=true
FAIL  轮询的 setTimeout 全部被句柄接住 -> bare=2, handled=0
```

**3) 非回归（既有套件，全部用默认端口）**

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/e2e.mjs` | 29 passed / 0 failed | 0 |
| `node tools/cooldown.mjs` | 87 passed / 0 failed | 0 |
| `node tools/input-safety.mjs` | 97 passed / 0 failed | 0 |
| `node tools/button-ids.mjs` | 52 passed / 0 failed | 0 |
| `node tools/storage-resilience.mjs` | 51 passed / 0 failed | 0 |
| `node tools/history-language.mjs` | 107 passed / 0 failed | 0 |

> 本次 `storage-resilience` 用**默认 CDP 端口 9445 直接通过**：
> 运行前用 `netstat` 确认 9445 已空闲（CM-007 那次它被本机另一进程的对外连接
> 占为源端口）。若下次复跑遇到 `CDP 未就绪`，按 `tools/README.md` 的说明
> 换 `<套件>_CDP_PORT=<空闲端口>` 并记录实际命令。

**4) 其他检查**

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node tools/check-worktree.mjs` | 未发现被删除的已跟踪文件 | 0 |
| `git diff --check` | 无空白错误 | 0 |
| `node node_modules/eslint/bin/eslint.js .` | **0 error / 1 warning**（warning 见已知问题） | 0 |

### 四、开发过程中由测试发现并修掉的两处

1. **终态未清句柄**：首轮跑测试时 S1/S2/S3 各有一条 `pollArmed = false` 失败 ——
   轮询到达终态后 `receiptPollTimer` 仍留着已触发的旧 id，
   于是「句柄非空」不再等价于「有轮询在等待」。
   已在 read 命中与 timeout 两个终态先清句柄再写状态条。
   这不只是让测试变绿：字段失去真值语义本身就是生命周期实现的缺陷。
2. **lint error**：`tools/receipt-lifecycle.mjs` 有一处无用赋值
   （`no-useless-assignment`），已删。lint 回到 0 error。

### 五、已知问题与范围外发现（**未擅自修复**）

1. **`tools/worktree-guard.mjs:117` 的 lint warning** 仍在（`catch (e)` 的 `e` 未使用），
   与 CM-006 / CM-007 报告一致。该文件属 GOV-001 防线，非本任务引入，**未修**。

2. **审计文档的过时描述**（未修改，属主 AI 的审计基线）：
   - `docs/TECH_DEBT.md:68-74` CM-001-TD-07 —— **已解决**，可考虑标记关闭
   - `docs/DATA_FLOW.md:62` 「轮询 timer 不保存到模块状态，无法由新请求取消旧轮询；
     多个请求的回执都写同一个 `#receiptStatus`」—— **已不成立**
   - `docs/ARCHITECTURE.md:55` 描述每 2 秒轮询、最多 15 次 —— 结论仍有效，
     但可补一句「轮询句柄化、新发送会取消旧轮询」
   - `AGENTS.md:239` 「所有已读回执轮询共享 `#receiptStatus`，轮询 timer 当前不可取消」
     —— **后半句已不成立**

3. **`tools/cooldown.mjs`（CM-006）的 CDP 端口 9446 与 CM-004 重复** —— 已在 CM-007
   报告中记录，本次仍未修（属 CM-006 范围）。本任务的 9449 是按任务卡建议选的，
   未新增冲突。

### 六、未执行的验证

- 未在真实 JSONBin 上验证 —— 为避免外部副作用，回归用 fetch 桩离线模拟回执；
  JSONBin 的真实读取方式未改动。
- 未验证「多次发送后状态条最终一定收敛到最后一次的回执」在**三次以上**连续发送下的表现 ——
  本脚本覆盖两次连续发送（S3）。三连发的路径与两次同理（每次都先失效旧轮询），
  但未单独断言。

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
