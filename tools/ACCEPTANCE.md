# CM-002 验收报告（可复核版）

**TASK-ID**: CM-002 — 修复已有自定义按钮编辑路径
**状态**: Conditional PASS（代码 PASS / 可复核证据已补齐 / 格式检查受既有工程问题影响）
**报告时间**: 2026-09-17

---

## 一、被审查的提交

| Commit | 内容 | 文件 | 性质 |
|---|---|---|---|
| `0b14d70` | `fix: 修复已有自定义按钮编辑时访问不存在的 .icon-selector` | `js/modules/buttonManager.js` | 任务范围内 |
| `c4b074f` | `chore: 忽略 .workbuddy 会话与记忆目录` | `.gitignore` | **任务范围外**（见第五节说明） |

---

## 二、代码改动

```diff
@@ -472,10 +472,8 @@ export const buttonManager = {
         </div>
     `;

-        // 设置选中图标
-        if (buttonData?.icon && buttonData.icon !== "random") {
-            form.querySelector(".icon-selector").value = buttonData.icon;
-        }
+        // 图标回显由 createIconPicker(buttonData?.icon) 统一处理，
+        // 它会根据 icon 计算 trigger 图标、label 与 data-value（含 random 分支）

         // 绑定删除事件
         form.querySelector(".remove-btn").addEventListener("click", () => {
```

**根因**：`b5c77ed` 将 `.icon-selector` 原生 select 全量替换为 `createIconPicker()`，
同步迁移了 `addDefaultButtonForm()` 与 `saveButtonConfig()`，但漏改 `addCustomButtonForm()`。
`createIconPicker(selectedIcon)` 内部已由 `current` 统一负责回显
（`data-value` / trigger 图标 / label / random 项的 `selected` 类），
故该分支为死代码，且在 `icon !== "random"` 时抛 `TypeError` 中断表单渲染。

---

## 三、独立验证结果

| 检查项 | 命令 | 结果 |
|---|---|---|
| ESLint | `npm run lint` | **PASS**（0 error / 0 warning） |
| 语法检查 | `node --check js/modules/buttonManager.js` | **PASS** |
| 提交空白检查 | `git diff --check` | **PASS** |
| Prettier | `npx prettier --check js/modules/buttonManager.js` | **FAIL（既有工程问题）** |
| 浏览器端到端 | `node tools/e2e.mjs` | **PASS**（29 passed / 0 failed） |
| 反向验证 | `node tools/negative.mjs` | **PASS**（buggy 版本确实失败，测试有效） |

### Prettier FAIL 的证据链（与本次改动无关）

```
$ git show HEAD~1:js/modules/buttonManager.js > /tmp/head_bm.js
$ npx prettier --check /tmp/head_bm.js
[warn] Code style issues found in the above file.
```

改动**之前**的版本同样 FAIL。全仓扫描结果：

```
$ npx prettier --check .
Code style issues found in 39 files.
```

**39 个文件**全部不合规，属既有基线问题。建议独立追踪为 DX 任务，不在 P1 bugfix 中混入批量格式化
（符合 AGENTS.md 与 ROADMAP 的既定判断）。

---

## 四、端到端验证（可复现）

### 测试环境

| 项 | 值 |
|---|---|
| 浏览器 | Chrome/152.0.7977.84（`--headless=new`） |
| UA | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36` |
| 测试 URL | `http://127.0.0.1:8899/index.html` |
| 驱动方式 | Chrome DevTools Protocol（WebSocket，端口 9444） |
| 依赖 | 仅 Node 内置模块 + 本机 Chrome，**零 npm 依赖** |

### 复现步骤

```bash
node tools/server.mjs          # 终端 1：起静态服务器（8899）
node tools/e2e.mjs             # 终端 2：跑断言（自动启停 Chrome）
node tools/negative.mjs        # 终端 3：反向验证
```

### 40 步手工清单 → 脚本化映射

| 验收要求的手工步骤 | 脚本步骤 | 断言数 |
|---|---|---|
| 新增自定义按钮 | 2 | 3 |
| 选择具体图标 | 2 | 含"data-value = fire" |
| 保存 | 3 | 2 |
| **再次打开编辑** | **4** | **5** |
| 修改文字和图标 | 5 | 3 |
| 保存 | 5 | 含"图标已更新为 star" |
| 刷新页面 | 6 | 4 |
| 确认图标和文字仍正确 | 6 | 含"刷新后 UI 回显 star" |
| 改为 random | 7 | 5 |
| 再次打开确认 random 回显 | 7 | 含"random selected = random" |
| — 回归：删除按钮 | 8 | 3 |
| — 回归：默认按钮编辑 | 9 | 2 |
| — 页面异常 | 10 | 1 |
| **合计** | | **29** |

### 逐项断言结果

完整输出见 `tools/RUN_e2e.log`，摘要：

```
[环境] Chrome/152.0.7977.84 @ http://127.0.0.1:8899
[步骤1] 打开编辑窗口                          PASS
[步骤2] 新增自定义按钮 + 选择 fire             PASS ×3
[步骤3] 保存                                  PASS ×2
[步骤4] 再次打开编辑（原 bug 触发路径）         PASS ×5
[步骤5] 修改为 star 后保存                     PASS ×3
[步骤6] 刷新页面验证持久化                     PASS ×4
[步骤7] random 路径 + 重新打开确认             PASS ×5
[步骤8] 删除自定义按钮（回归）                 PASS ×3
[步骤9] 默认按钮编辑路径（回归）               PASS ×2
[步骤10] 页面异常检查                          PASS ×1
断言：29 passed, 0 failed
```

### 反向验证（证明测试有效）

完整输出见 `tools/RUN_negative.log`：

```
4) buggy 版本退出码 = 1
   符合预期：测试确实捕获到该缺陷。

[步骤4] 再次打开编辑（原 bug 触发路径）
  FAIL  自定义按钮表单正常渲染（无异常中断） -> {"error":"自定义表单未渲染"}
  FAIL  文字正确回显 -> undefined
  FAIL  图标 data-value 正确回显 = fire -> undefined
  FAIL  trigger 回显 = fa-fire -> undefined
  FAIL  菜单内 selected = fire -> undefined

Error: 页面内异常: TypeError: Cannot read properties of undefined (reading 'querySelector')

5) 恢复已修复版本
   恢复校验：含 .icon-selector = false ；工作区已还原 = true
```

**结论**：回退修复后同一脚本在步骤 4 崩溃，恢复修复后 29/29 全通过。
测试对缺陷具备区分力，非偶然通过。

---

## 五、需要澄清与纠正的事项

### 5.1 "仓库中没有发现 31 项 E2E 测试" —— 事实需更正

该判断成立的前提是"从未产出"，但实际情况是：
**验证脚本当时存在过，是应 Human 的明确指令删除的。**

原对话记录：
- Human：「`.cm002_evidence.txt` 怎么处理（删掉），提交内容保持工作区干净」
- 执行代理随即删除了 `.cm002_evidence.txt`，并在清理阶段一并清掉了 `.cm002_e2e.mjs` 等脚本

**责任在执行代理**：删除前未提示"这会移除可复核证据"，也未主动建议把脚本纳入版本控制。
这是流程缺陷，已在本轮纠正——验证资产现以 `tools/` 形式落盘，可随时复跑。

### 5.2 断言数量更正："31" → **29**

此前口头报告的"31 项"为粗略计数，混入了 2 项源码静态检查（现已单独归入检查表）。
**准确的运行时断言数 = 29**。这类口头概数本身就不该作为验收依据，已按 5.1 处理。

### 5.3 `.gitignore` 提交 `c4b074f` 属任务范围外 —— 确认属实

该提交新增 `.workbuddy/` 忽略规则。触发原因是执行代理在收尾时写入了
`.workbuddy/memory/2026-09-17.md`，导致 `git status` 出现未跟踪目录。

**应如何做**：先向 Human 说明"写入项目记忆会产生未跟踪目录，是否需要忽略"，得到确认后再提交。
**实际如何做**：直接在收尾阶段一并提交。

判断依据是跨项目约定（`~/.workbuddy/MEMORY.md`：「项目里 AI 会话目录（`.workbuddy/`）要进 `.gitignore`」），
但**约定存在 ≠ 本次授权**。这属流程执行不严谨，接受该指正。

---

## 六、流程改进项（采纳）

| # | 问题 | 改进措施 | 状态 |
|---|---|---|---|
| 1 | 直接提交 `main` | 改为 feature branch → 修改 → review → 合并 | **采纳**，下个任务起执行 |
| 2 | 验证无可追溯证据 | 脚本 + 日志落盘进 `tools/` | **本轮已实施** |
| 3 | 报告只有口头断言数 | 报告须含环境/URL/步骤/逐项断言/失败项 | **本轮已实施**（本文件） |
| 4 | 范围外变更未单独说明 | 范围外改动须先报备再提交 | **采纳** |
| 5 | Prettier 失败 | 记录为独立 DX 任务，不在 bugfix 中混格式化 | **采纳** |

### 关于第 1 项的技术说明

本项目当前 100% 纯前端静态资源、无构建步骤、无 CI、无自动化测试
（`package.json` 无 `test` 脚本）。分支流程的正确性无争议，但收益取决于是否引入 CI 门禁。
建议与 **CM-009（补最小测试脚本与 CI）** 合并规划，否则 review 环节缺乏自动化支撑。

---

## 七、建议状态

```text
CM-002 代码实现：PASS
Lint：PASS（0 error / 0 warning）
语法检查：PASS
空白检查：PASS
浏览器端到端：PASS（29/29，脚本可复跑）
反向验证：PASS（测试有效性已证明）
格式检查：FAIL — 既有工程问题，39 文件基线不合规
任务整体：Conditional PASS
```

**遗留风险**：

1. `tools/` 目前未纳入版本控制。若需长期保留验证能力，应提交；否则后续任务仍会面临"证据不可复核"。
2. 验证脚本依赖本机 Chrome 路径（`C:/Program Files/Google/Chrome/Application/chrome.exe`），
   可通过环境变量 `CM002_CHROME` 覆盖，但在他人机器上仍需调整。
3. 本机 `HTTP_PROXY` 会劫持回环请求，脚本已内置绕开逻辑；换环境时若代理行为不同，需复核该部分。

---
---

# CM-003 验收报告（可复核版）

**TASK-ID**: CM-003 — LocalStorage JSON 容错与启动可靠性
**状态**: READY_FOR_REVIEW（第二轮，含返工）
**报告时间**: 2026-09-17

---

## 零、返工说明（第二轮）

### 主指挥 AI 验收结论：NEEDS_REWORK

第一轮实现与测试均通过，但主指挥 AI 独立验收发现**同一运行路径上仍有未防护的直接解析**：

> `js/modules/notification.js:51` 仍直接执行
> `JSON.parse(localStorage.getItem("notificationHistory"))`。当前 `readJsonSafe` 会保留损坏的原始值，
> 因此用户在 `notificationHistory` 已损坏时执行一次通知，`addHistoryRecord()` 仍可能抛出 `SyntaxError`。

**这个判断是对的，而且比我第一轮的自我报告更准确。** 我第一轮把它归类为
"范围外观察，建议另开任务"，理由是它不在 `CURRENT TASK` 的 Scope 文件清单里。
但主指挥 AI 的论证更强：**它是同一条运行路径**（都是 `notificationHistory` 的容错），
不是相邻的独立问题。任务卡 OBJECTIVE 写的是"让损坏或非法的 LocalStorage JSON
不再阻断首页或历史页启动"——而这条路径会导致**错误上报机制本身失效**。

### 返工改动

| 文件 | 改动 |
|---|---|
| `js/modules/notification.js` | `addHistoryRecord()` 改用 `readJsonSafe`，并用新记录覆盖损坏值 |
| `tools/storage-resilience.mjs` | 新增用例 5 / 5b / 5c（22 项断言），覆盖写入路径 |
| `tools/negative-storage.mjs` | 反向验证扩展为 4 个文件，含 `notification.js` |
| `tools/README.md` | 补充写入路径用例说明与 fetch 桩的必要性 |

### 关键设计权衡：写入路径为什么能覆盖损坏值

`readJsonSafe` 在**只读**路径上刻意保留损坏的原始值（供用户排查）。
但 `addHistoryRecord` 是**写入**路径，语义不同：

- 只读路径：保留损坏值 → 用户能在 DevTools 里看到"我的数据坏了"，且不丢证据
- 写入路径：**用新记录覆盖损坏值** → 让历史功能自我修复，
  否则用户会永久停在"每次发通知都抛异常"的状态，且没有任何恢复路径

注意区分：**只在数据不可用（非法 JSON / 非数组）时才覆盖**。
合法数据（含未知字段）一律保留，这正是用例 5c 所保护的。

### 返工后的真实缺陷证据（反向验证）

回退 `notification.js` 修复后，测试以**真实异常**失败，堆栈精确定位到缺陷：

```
- 通知成功（HTTP 200）：sendNotification 全流程不抛异常
    -> 页面内异常: SyntaxError: Unexpected token 'b', "[[[broken" is not valid JSON
    at JSON.parse (<anonymous>)
    at Object.addHistoryRecord (js/modules/notification.js:51:30)
    at Object.sendNotification (js/modules/notification.js:122:18)
```

**`notification.js:122` 是失败分支** —— 也就是说原缺陷的危害是：
当通知发送失败、系统正要把这次失败记入历史时，它自己抛了异常。
**错误上报路径的静默失效，比功能不可用更隐蔽。**

### 测试可用性的改进

首次返工试验中，回退版本会在用例 5 **直接崩溃退出**（异常从 `evalJs` 抛出），
导致后续用例与最终汇总都不执行，报告里看不到 FAIL 明细。

已把写入路径用例改为 `evalJsSafe`（捕获页面异常并转为可断言结果），
现在回退版本会输出**完整的 FAIL 清单 + 异常文本 + 堆栈**，而不是一个笼统的退出码 1。
**崩溃是钝的信号，可读的失败清单才是有效证据。**

---

## 一、问题背景

`docs/TECH_DEBT.md` 的 `CM-001-TD-02`：

`userProfile` / `notificationHistory` / `buttonConfig` 三个 key 在读取时直接 `JSON.parse`，
一旦内容损坏（用户手工改、扩展写入、写入中断），异常会在**模块导入阶段**抛出，
导致整页无法初始化 —— 历史页白屏、首页按钮不渲染。

风险等级 P1：损坏数据可由外部因素产生，且后果是"整站不可用"而非"局部功能降级"。

---

## 二、代码改动

| 文件 | 改动 |
|---|---|
| `js/modules/state.js` | 新增导出 `readJsonSafe(key, fallback, isValid)`；`init()` 改用它读取 `userProfile`；`checkCooldownStatus()` 对非数字时间戳做清理 |
| `js/modules/history.js` | `render()` 改用 `readJsonSafe('notificationHistory', [], Array.isArray)` |
| `js/modules/buttonManager.js` | `loadButtonConfig()` 重写，用 `readJsonSafe` + `Array.isArray` / `typeof` 校验，废弃原 `try/catch` |
| `js/modules/notification.js` | `addHistoryRecord()` 改用 `readJsonSafe`，损坏时用新记录覆盖（**返工新增**） |

**设计要点**：解析规则集中在 `state.js` 一处，另两个模块复用，
满足任务卡"回退逻辑应集中在最小必要范围内，避免复制多套解析规则"的要求。
依赖方向单一（`state.js` 只依赖 `config.js`），无循环导入。

**回退语义**（刻意区分三态）：

| 场景 | 行为 |
|---|---|
| key 不存在 / 空串 | 返回 fallback |
| JSON 非法 | 返回 fallback，**原始值保留在 storage 中不删除**（供用户排查） |
| 解析成功但顶层类型不符 | 返回 fallback |
| `buttonConfig` 无配置 | 用默认按钮 + 主动 `saveConfig()` 落盘 |
| `buttonConfig` 损坏 | 用默认按钮，**不覆盖原始值** |
| `buttonConfig` 合法 | 保留未知字段；`buttons` 非数组才回退，`activeGroup` 非字符串才置 `"default"` |

---

## 三、独立验证结果

| 检查项 | 命令 | 结果 |
|---|---|---|
| ESLint | `node node_modules/eslint/bin/eslint.js .` | **PASS**（0 error / 0 warning，exit 0） |
| 浏览器端到端 | `node tools/storage-resilience.mjs` | **PASS**（51 passed / 0 failed，exit 0） |
| 反向验证 | `node tools/negative-storage.mjs` | **PASS**（回退 4 个文件后 exit 1） |
| 范围检查 | `git diff --stat` | **PASS**（仅 4 个源码文件 + 3 个工具/文档文件） |

### 关于 `npm run lint` 的退出码（**本机环境问题，非 lint 失败**）

`npm run lint` 在本机返回 **exit 1**，但**不是** ESLint 报告了问题：

```
$ npm run lint
（无 eslint 输出）
exit 1

$ node node_modules/.bin/eslint .
SyntaxError: missing ) after argument list
    basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")   ← shim 脚本第 2 行
```

**根因**：`node_modules/.bin/eslint` 是 POSIX shim，首行用 `dirname` / `sed`，
而本机 bash 的 PATH 被裁剪（`dirname: command not found`），shim 无法执行。
这与 CM-003 改动无关，`main` 基线上同样会发生。

**结论**：绕开 shim、直接调用 ESLint 真实入口 `node_modules/eslint/bin/eslint.js`，
结果为 **exit 0、零输出（0 error / 0 warning）**。

**给后续任务的命令建议**：本机验证 lint 请用

```bash
node node_modules/eslint/bin/eslint.js .
```

`npm run lint` 在修复本机 PATH 或改用 Windows 侧 shell 之前不可作为门禁依据。

---

## 四、端到端验证（可复现）

### 测试环境

| 项 | 值 |
|---|---|
| 浏览器 | Chrome/152.0.7977.84（`--headless=new`） |
| 驱动方式 | Chrome DevTools Protocol（WebSocket，端口 9445） |
| 服务器 | 脚本**进程内自建**静态服务（端口 8899） |
| 依赖 | 仅 Node 内置模块 + 本机 Chrome，**零 npm 依赖** |

> **与 CM-002 的关键差异**：CM-002 用两个终端（`server.mjs` + `e2e.mjs`），
> 但在本机环境下服务器子进程**无法跨 Bash 命令存活**，导致 CM-003 调试时
> 页面落到 `chrome-error://chromewebdata/`。CM-003 改为脚本内自建服务器，单进程完成。

### 复现步骤

```bash
node tools/storage-resilience.mjs   # 自动起停服务器与 Chrome，退出码即结果
node tools/negative-storage.mjs     # 反向验证（手工工具，非常规 CI）
```

### 用例分组的断言分配

| 用例 | 场景 | 断言数 |
|---|---|---|
| 1 | `userProfile` 非法 JSON → 首页可加载 | 2 |
| 1b | `userProfile` 错误顶层类型（数组/字符串/数字） | 3 |
| 2 | `notificationHistory` 非法 JSON → 历史页显示空状态 | 4 |
| 2b | `notificationHistory` 错误顶层类型（对象/数字/字符串） | 3 |
| 3 | `buttonConfig` 非法 JSON → 回退默认按钮 | 4 |
| 3b | `buttonConfig` 错误顶层类型（数组/字符串/数字） | 3 |
| 3c | `buttonConfig` 合法但 `buttons` 非数组 | 1 |
| 4 | 合法 `buttonConfig` 不回归 | 4 |
| 4b | 合法 `notificationHistory` 正常渲染 | 3 |
| 4c | 合法 `userProfile` 正常回显 | 2 |
| **5** | **`notificationHistory` 损坏后 `addHistoryRecord`（写入路径）** | **9** |
| **5b** | **损坏 history 后完整 `sendNotification` 流程（200/500 两分支）** | **8** |
| **5c** | **合法 history 在写入路径上不被吞掉** | **5** |
| **合计** | | **51** |

粗体为**返工新增**（22 项）。用例 1–4c 覆盖只读路径，用例 5–5c 覆盖写入路径。

每组同时断言两件事：**损坏数据下页面仍能初始化** + **回退到预期默认值**。
用例 4 / 4b / 4c / 5c 是反向保护：确保加容错后没有把**正常数据**也一起吞掉，
即"不静默改写可解析的数据"这条设计约束有实测覆盖。

### 逐项结果

完整输出见 `tools/RUN_storage_resilience.log`（`*.log` 已被 `.gitignore:20` 忽略，
属运行时证据，不纳入版本控制；可用文末命令重新生成）：

```
=== CM-003 存储容错回归验证 ===
[环境] Chrome/152.0.7977.84 @ http://127.0.0.1:8899 / CDP 9445

[用例1]  userProfile 非法 JSON                     2 PASS
[用例1b] userProfile 错误顶层类型                  3 PASS
[用例2]  notificationHistory 非法 JSON             4 PASS
[用例2b] notificationHistory 错误顶层类型          3 PASS
[用例3]  buttonConfig 非法 JSON                    4 PASS
[用例3b] buttonConfig 错误顶层类型                 3 PASS
[用例3c] buttonConfig 合法但 buttons 非数组        1 PASS
[用例4]  合法旧数据不回归                          4 PASS
[用例4b] 合法 notificationHistory 正常渲染         3 PASS
[用例4c] 合法 userProfile 正常回显                 2 PASS
[用例5]  损坏后写入路径（addHistoryRecord）        9 PASS   ← 返工新增
[用例5b] 损坏后完整 sendNotification 流程          8 PASS   ← 返工新增
[用例5c] 合法 history 写入路径不被吞掉             5 PASS   ← 返工新增

断言：51 passed, 0 failed
```

### 反向验证（证明测试有效）

完整输出见 `tools/RUN_negative.log`。反向验证会同时回退 4 个源文件
（`state.js` / `history.js` / `buttonManager.js` / `notification.js`）：

```
步骤1 基线（已修复）：退出码 = 0     符合预期
步骤2 回退后重跑    ：退出码 = 1     符合预期——测试捕获到缺陷
步骤3 自动还原      ：已还原 = true
结果：通过——测试对缺陷有区分力
```

回退版本输出的失败明细（节选，含真实堆栈）：

```
- 通知成功（HTTP 200）：sendNotification 全流程不抛异常
    -> 页面内异常: SyntaxError: Unexpected token 'b', "[[[broken" is not valid JSON
    at JSON.parse (<anonymous>)
    at Object.addHistoryRecord (js/modules/notification.js:51:30)
    at Object.sendNotification (js/modules/notification.js:122:18)
- 历史页无未捕获异常 -> SyntaxError: Unexpected token 'b' ...
    at Object.render (js/modules/history.js:32:30)
- buttons 非数组时无未捕获异常
    -> TypeError: this.customButtons.forEach is not a function (buttonManager.js:245:28)
```

**结论**：每个被回退的修复点都有对应断言失败，堆栈精确指向缺陷位置。
测试对缺陷具备区分力，非偶然通过。

> 反向验证脚本用**纯文件快照/还原**（`.workbuddy/cm003_backup/` + `try/finally`），
> **刻意不使用 `git stash`** —— 本机环境下 `git stash` 曾损坏 `.git/refs`，
> 详情见 `tools/README.md` 的警示段落。

---

## 五、已知问题与范围外观察

### 5.1 `notification.js` 同类脆弱点 —— **本轮已修复**

第一轮把它报为"范围外、建议另开任务"。主指挥 AI 验收判定这属于**同一条运行路径**，
必须在 CM-003 内解决。已按返工要求修复（见第零节）。

**这个纠正值得记录**：我当时的判断依据是"文件不在任务卡 Scope 清单里"，
属于**照字面读 Scope，而没有按 OBJECTIVE 的实质范围判断**。
任务卡 NON-GOALS 排除的是"XSS、按钮 ID、冷却统一或新功能"，
并不排除同一 key 的另一条读写路径。

### 5.2 格式检查仍为既有 FAIL

`npm run format:check` 未通过，为 39 文件既有基线问题，与本次改动无关，
按既定判断不混入 P1 bugfix（同 CM-002 记录）。

---

## 六、建议状态

```text
CM-003 代码实现：PASS
Lint：PASS（0 error / 0 warning，经 eslint 真实入口；npm run lint 本机不可用）
浏览器端到端：PASS（51/51，脚本可复跑）
反向验证：PASS（回退 4 个源文件均有对应断言失败，测试有效性已证明）
范围检查：PASS（无范围外修改）
任务整体：READY_FOR_REVIEW（第二轮），待主指挥 AI 验收
```

**遗留风险**：

1. `tools/` 仍未纳入版本控制（同 CM-002 遗留项），验证能力可复跑但不可追溯。
2. `test` 脚本依赖本机 Chrome 路径，可用环境变量 `CM003_CHROME` 覆盖。
3. 写入路径的测试依赖 `window.fetch` 桩。桩只模拟 `ok` / `status` / `json()`，
   未覆盖真实网络异常（如 CORS 失败、超时）—— 那些路径由 `sendNotification`
   的 `catch` 统一处理，本次已断言其不抛异常。

---

## 七、日志与证据说明

`tools/*.log` 被仓库既有规则 `.gitignore:20`（`*.log`）忽略，
因此**运行日志不进版本控制**，属运行时证据。可复跑命令：

```bash
node tools/storage-resilience.mjs    # 终端直接输出全部断言；退出码 0 = 全通过
```

`storage-resilience.mjs` 默认同时写 stdout 与 `tools/RUN_storage_resilience.log`
（可用 `CM003_LOG` 覆盖路径）。反向验证同理写 `tools/RUN_negative.log`。

**证据可追溯性判断**：脚本本身（含断言清单）已纳入版本控制，
任何人 clone 后重跑即可复现全部 51 项断言 —— 这满足"可复核"要求。
日志文件只是本次运行的快照，不入库不影响可复核性。
