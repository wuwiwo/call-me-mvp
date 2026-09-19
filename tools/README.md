# 验证工具

可复现的浏览器端到端验证，用于复核：

- **CM-002** — 修复已有自定义按钮编辑路径（`e2e.mjs`）
- **CM-003** — LocalStorage JSON 容错与启动可靠性（`storage-resilience.mjs`）
- **CM-004** — 按钮 ID 兼容规则（`button-ids.mjs`）

## 依赖

仅 **Node 内置模块** + 本机 Chrome。**零 npm 依赖**，不污染 `package.json`。

## 跑法

### 统一入口（推荐，CM-009）

```bash
npm test                                # = node tools/run-all.mjs
                                        #   lint + 8 个套件 + check-worktree，串行，约 4 分钟
npm run test:quick                      # 只跑 lint + check-worktree（几秒）
node tools/run-all.mjs                  # 等价于 npm test
node tools/run-all.mjs --skip-browser   # 等价于 npm run test:quick
```

`run-all.mjs` 逐项报告**套件名 / 断言汇总 / 退出码 / 耗时**，任一失败整体退出码非 `0`，
并直接列出失败项（或该套件的输出末尾），方便定位。

> **为什么必须串行**：所有套件都用 HTTP `8899`（各自进程内起静态服务器），并行会抢端口。
> `run-all.mjs` 用 `spawnSync` 逐个跑，天然串行。
>
> **为什么 `check-worktree` 放最后**：它兼作"跑完这一轮后工作区仍完好"的收口检查。

### 单个套件

```bash
node tools/e2e.mjs                  # CM-002：29 项断言（自带服务器）
node tools/storage-resilience.mjs   # CM-003：51 项断言（自带服务器）
node tools/button-ids.mjs           # CM-004：52 项断言（自带服务器）
node tools/input-safety.mjs         # CM-005：97 项断言
node tools/cooldown.mjs             # CM-006：87 项断言
node tools/history-language.mjs     # CM-007：107 项断言
node tools/receipt-lifecycle.mjs    # CM-008：54 项断言（约 2 分钟）
node tools/password-gate.mjs        # CM-010：60 项断言
```

### 手工反向验证（不进 CI、不进 run-all）

```bash
node tools/negative.mjs                     # CM-002
node tools/negative-storage.mjs             # CM-003
node tools/negative-button-ids.mjs          # CM-004
node tools/negative-input-safety.mjs        # CM-005
node tools/negative-cooldown.mjs            # CM-006
node tools/negative-history-language.mjs    # CM-007
node tools/negative-receipt-lifecycle.mjs   # CM-008（约 4 分钟）
node tools/negative-password-gate.mjs       # CM-010
```

所有脚本都以退出码表达结果：`0` = 通过，非 `0` = 失败。

> **三个脚本都自带静态服务器**（与 Chrome 同进程），不需要另开终端。
> 原因见下文「服务器必须与浏览器同进程」。
> CM-002/CM-003 也支持复用外部服务器：`CM002_NO_SERVER=1` / `CM003_NO_SERVER=1`。

## CI（GitHub Actions）

`.github/workflows/ci.yml`：`push`(main) + `pull_request` + 手动触发，`ubuntu-latest` + Node 22。

命令序列（与本地 `npm test` 是同一条入口）：

```bash
npm ci
npm run lint        # 单列一步
npm test            # = node tools/run-all.mjs
```

- **lint 为什么既单列一步、又在 `run-all.mjs` 里**：单列是为了**快速失败** ——
  几秒就能报出语法问题，不必等 4 分钟的浏览器套件跑完。
  `run-all.mjs` 第一步也是 lint，保证"单一入口"单独执行时语义完整。
- **Chrome**：ubuntu runner 自带 Google Chrome，由 `tools/chrome-path.mjs` 自动解析；
  需要强制指定时设 `CHROME_PATH`。**不需要 xvfb**（`--headless=new` 不依赖显示器）。
- **日志**：CI 设 `CM009_VERBOSE=1` + `CM009_LOG=ci-run-all.log`，
  并以 artifact 上传（`if: always()`，保留 7 天）。`*.log` 已被 `.gitignore` 忽略，不会入库。
- **反向验证不进 CI**：`negative-*.mjs` 会临时改写业务源码，属手工证据工具
  （AGENTS.md 明确规定）。workflow 里也不引用它们。

> 本机无法执行 GitHub Actions，因此 CI 有效性的证据是：
> ① workflow YAML **真实解析**（PyYAML `safe_load`）+ 关键结构断言；
> ② 本地按上面同一命令序列逐步干跑并记录退出码。见本任务的 EXECUTION REPORT。

## 文件说明

| 文件 | 用途 |
|---|---|
| `run-all.mjs` | **统一入口**（CM-009）：串行跑 lint + 8 个套件 + `check-worktree.mjs`，逐项报套件名/断言汇总/退出码，任一失败整体非零 |
| `chrome-path.mjs` | 套件共用的 Chrome 可执行文件解析（CM-009）：`<套件>_CHROME` > `CHROME_PATH` > 常见安装路径 > `which` |
| `server.mjs` | 零依赖静态服务器，服务仓库根目录（可选，供复用外部服务器时使用） |
| `e2e.mjs` | CM-002：CDP 驱动真实浏览器，29 项断言 |
| `negative.mjs` | CM-002：回退修复 → 重跑 → 自动还原，验证测试有效性 |
| `storage-resilience.mjs` | CM-003：存储容错，51 项断言 |
| `negative-storage.mjs` | CM-003：反向验证（纯文件备份还原） |
| `button-ids.mjs` | CM-004：按钮 ID 兼容规则，52 项断言 |
| `negative-button-ids.mjs` | CM-004：反向验证 |
| `input-safety.mjs` | CM-005：动态用户输入注入防护 + 严格图标允许列表，97 项断言 |
| `negative-input-safety.mjs` | CM-005：反向验证（从基线 ref 取原文覆盖，非手写回退片段） |
| `cooldown.mjs` | CM-006：cooldown 单一责任（状态转换 / 持久化 / timer 生命周期），87 项断言 |
| `negative-cooldown.mjs` | CM-006：反向验证（从基线 ref 取原文覆盖 5 个被测源码） |
| `history-language.mjs` | CM-007：历史页语言初始化与多语言文案，107 项断言 |
| `negative-history-language.mjs` | CM-007：反向验证（从基线 ref 取原文覆盖 4 个被测文件） |
| `receipt-lifecycle.mjs` | CM-008：已读回执轮询的可取消与单一所有权，54 项断言 |
| `negative-receipt-lifecycle.mjs` | CM-008：反向验证（从基线 ref 取原文覆盖 1 个被测源码） |
| `password-gate.mjs` | CM-010：访问提示触发语义 / 单一来源 / 诚实文案，60 项断言 |
| `negative-password-gate.mjs` | CM-010：反向验证（从基线 ref 取原文覆盖 2 个被测文件） |
| `check-worktree.mjs` | 环境防护（手动）：检出「已跟踪文件在工作区被删除」，`--fix` 可从 HEAD 恢复 |
| `worktree-guard.mjs`（已移至 `scripts/`） | 环境防护（自动）：由 `.githooks/{post-checkout,post-merge,post-commit}` 驱动，自动识别并恢复级联误伤。**不在 `tools/` 下** —— 见下节 GOV-002 说明 |
| `ACCEPTANCE.md` | CM-002 / CM-003 / CM-004 / CM-005 的完整验收报告 |

> ### ⚠️ 复现/排查工作区文件丢失前必读
> 命令若带 `Sandbox bypassed (escalation-approved)` 标记，该进程**未被注入 `tsbx.dll`**，
> 删除走原生语义、不进回收站、**级联不可能发生** → 任何"阴性结果"都是**假阴性**。
> 这不是偶发噪音：沙箱 `default_action: "deny_write"` 使**所有写操作都要过授权闸门**，通过后即无沙箱。
> 详见 [`../docs/handoff/archive/WORKTREE-FILE-LOSS.md`](../docs/handoff/archive/WORKTREE-FILE-LOSS.md)
> 的「根因（修正版）」与报告 `.workbuddy/worktree-file-loss-bugreport.md` §15。
>
> `scripts/worktree-guard.mjs`（已移出 `tools/`）的日志 `.workbuddy/worktree-guard.log`
> **只在真的恢复过文件时才写** —— 「没有日志」不代表防线失效。

> **日志文件不入库。** `tools/*.log` 被 `.gitignore:20`（`*.log`）忽略 ——
> 它们是**运行时证据**，脚本自身（含全部断言清单）才是可追溯的复核依据。
> 重跑即可复现，用 `CM003_LOG` / `CM004_LOG` / `CM005_LOG` / `CM006_LOG` / `CM007_LOG` / `CM008_LOG` 可指定落盘路径。

## 测试资产治理

### 端口分配

| 用途 | 端口 | 说明 |
|---|---|---|
| HTTP（全部套件） | `8899` | 各自进程内起静态服务器 → **只能串行**；`run-all.mjs` 已串行 |
| CM-002 `e2e.mjs` | CDP `9444` | |
| CM-003 `storage-resilience.mjs` | CDP `9445` | ⚠️ 落在 Windows 动态端口范围内，可能被别的进程当"对外连接的源端口"占用 |
| CM-004 `button-ids.mjs` | CDP `9446` | |
| CM-005 `input-safety.mjs` | CDP `9447` | |
| CM-006 `cooldown.mjs` | CDP `9446` | ⚠️ **与 CM-004 重复**；两者 HTTP 同为 8899、本就串行，暂无实际冲突，属已知项 |
| CM-007 `history-language.mjs` | CDP `9448` | |
| CM-008 `receipt-lifecycle.mjs` | CDP `9449` | |
| CM-010 `password-gate.mjs` | CDP `9450` | |

**新增套件时**：挑一个未被占用的 CDP 端口（尽量避开 `9440–9500` 这类动态端口范围），
并更新本表。若运行时报 `CDP 未就绪：Chrome 是否启动？`，**先确认端口是不是被占了**：

```bash
netstat -ano | findstr :<port>     # 看是不是别的进程把它当源端口占了
<套件>_CDP_PORT=<空闲端口> node tools/<套件>.mjs   # 覆盖运行
```

报告里要写明**实际执行的命令**（带覆盖变量的形式），不要只写默认命令。

### Chrome 可执行文件解析

所有套件都走 `tools/chrome-path.mjs`，优先级（取第一个真实存在的）：

1. `<套件>_CHROME` —— 最具体，如 `CM002_CHROME`
2. `CHROME_PATH` —— 通用覆盖（本机 / CI 要强制指定时用这个）
3. 当前平台常见安装位置（Windows / macOS / Linux）
4. 其他平台常见位置（跨平台误配时的兜底）
5. `which google-chrome` / `chromium`（仅非 Windows）

一个候选都不存在时**不抛异常**：打印尝试清单后回退到首个候选，由 `spawn` 报出最终错误 ——
这样套件仍能先打印自己的环境头（含解析到的 Chrome 路径），失败原因可定位，
而不是"import 期就崩、什么都没打印"。

### 日志与证据

- **日志不入库**：`tools/*.log` 与仓库根的 `*.log` 都被 `.gitignore` 忽略。
  可复核性靠**脚本本身入库**（含完整断言清单），日志是运行时证据、不是唯一证据。
- 各套件用 `CM00x_LOG=<路径>` 把完整输出落盘；`run-all.mjs` 用 `CM009_LOG`。
- **删除证据或复现脚本前必须先报告**（AGENTS.md §）。可以删报告，
  但不应未经确认连带删除复现脚本。
- 日志里可能含**本机绝对路径**（如 Chrome 路径）；对外粘贴前先脱敏。
- `.workbuddy/`（AI 会话记忆、临时备份、一次性证据脚本）已被
  `eslint.config.js` 的 `ignores` 排除 —— 它是 gitignore 的本地目录、不随仓库分发，
  不该影响仓库的 lint 闸门。

### 反向验证属手工工具

`negative-*.mjs` 会**临时改写业务源码**再还原，因此：

- **不进 CI、不进 `run-all.mjs`、不进任何默认入口**；
- 用 `try/finally` + 文件快照保证异常中断也会还原，结束时逐文件比对磁盘与备份；
- **不使用 `git stash`** —— 本机 `git stash` 曾损坏 `.git/refs`。
  用 `git show <ref>:<file>` 取原文覆盖 + `try/finally` 还原；
- 改造合并进 `main` 之后，默认基线 `main` 会失效（报 exit 2「没有可回退的改动」）
  → 必须用 `<套件>_BASE_REF=<改造前 commit>` 显式指定基线。

### 新增套件的检查清单

1. 选一个未被占用的 CDP 端口，更新上面的**端口分配表**
2. Chrome 一律用 `resolveChrome(process.env.CMxxx_CHROME)`，**不要内联路径**
3. 自带静态服务器，并提供 `<套件>_PORT` / `<套件>_NO_SERVER` 覆盖
4. 汇总行固定输出成 `断言：N passed, M failed`（`run-all.mjs` 据此提取）
5. 配套 `negative-*.mjs` 反向验证，并确认回退版失败项**命中修复点关键字**
6. 加入 `run-all.mjs` 的 `BROWSER_SUITES`，更新本文档与 `tools/ACCEPTANCE.md`

## 可配置项（环境变量）

### CM-002

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CM002_BASE` | `http://127.0.0.1:8899` | 测试站点地址 |
| `CM002_CDP_PORT` | `9444` | Chrome 调试端口 |
| `CM002_CHROME` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Chrome 路径 |

### CM-003

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CM003_PORT` | `8899` | 自带服务器端口 |
| `CM003_BASE` | `http://127.0.0.1:8899` | 测试站点地址 |
| `CM003_NO_SERVER` | 未设置 | 设为 `1` 则复用外部服务器 |
| `CM003_CDP_PORT` | `9445` | Chrome 调试端口 |
| `CM003_CHROME` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Chrome 路径 |
| `CM003_LOG` | 未设置 | 设置后把实跑输出落盘到该路径 |

### CM-004

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CM004_PORT` | `8899` | 自带服务器端口 |
| `CM004_BASE` | `http://127.0.0.1:8899` | 测试站点地址 |
| `CM004_NO_SERVER` | 未设置 | 设为 `1` 则复用外部服务器 |
| `CM004_CDP_PORT` | `9446` | Chrome 调试端口 |
| `CM004_CHROME` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Chrome 路径 |
| `CM004_LOG` | 未设置 | 设置后把实跑输出落盘到该路径 |

> 各脚本默认都用 8899 端口，**不要并行运行**；如需并行，用各自的 `*_PORT` 错开。

### CM-005

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CM005_PORT` | `8899` | 自带服务器端口 |
| `CM005_BASE` | `http://127.0.0.1:8899` | 测试站点地址 |
| `CM005_NO_SERVER` | 未设置 | 设为 `1` 则复用外部服务器 |
| `CM005_CDP_PORT` | `9447` | Chrome 调试端口 |
| `CM005_CHROME` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Chrome 路径 |
| `CM005_LOG` | 未设置 | 设置后把实跑输出落盘到该路径 |
| `CM005_BASE_REF` | `main` | **仅反向验证使用**：取此 ref 中的原文作为"修复前版本" |

> `tools/input-safety.mjs` 会启动真实浏览器并注入 `<script>` / `<img onerror>` 等载荷。
> 它只操作被测页面的 LocalStorage，不写仓库文件。
> `negative-input-safety.mjs` 会临时改写 `js/modules/` 下两个被测文件，
> 属**手工反向验证工具，不纳入普通 CI**；它用 `try/finally` + 文件快照保证还原。

### CM-006

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CM006_PORT` | `8899` | 自带服务器端口 |
| `CM006_BASE` | `http://127.0.0.1:8899` | 测试站点地址 |
| `CM006_NO_SERVER` | 未设置 | 设为 `1` 则复用外部服务器 |
| `CM006_CDP_PORT` | `9446` | Chrome 调试端口 |
| `CM006_CHROME` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Chrome 路径 |
| `CM006_LOG` | 未设置 | 设置后把实跑输出落盘到该路径 |
| `CM006_BASE_REF` | `main` | **仅反向验证使用**：取此 ref 中的原文作为"收敛前版本" |

> `tools/cooldown.mjs` 会启动真实浏览器，但**完全离线**：它用一个 fetch 桩
> 替换 `window.fetch`，模拟 webhook 成功与失败，**不产生任何真实外部请求**。
> 它只操作被测页面的 LocalStorage，不写仓库文件。
> `negative-cooldown.mjs` 会临时改写 **5 个**被测源码（`state.js` / `main.js` /
> `buttonManager.js` / `notification.js` / `countdown.js`），
> 属**手工反向验证工具，不纳入普通 CI**；它用 `try/finally` + 文件快照保证还原，
> 并在结束时校验磁盘内容与备份一致。

### CM-007

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CM007_PORT` | `8899` | 自带服务器端口 |
| `CM007_BASE` | `http://127.0.0.1:8899` | 测试站点地址 |
| `CM007_NO_SERVER` | 未设置 | 设为 `1` 则复用外部服务器 |
| `CM007_CDP_PORT` | `9448` | Chrome 调试端口 |
| `CM007_CHROME` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Chrome 路径 |
| `CM007_LOG` | 未设置 | 设置后把实跑输出落盘到该路径 |
| `CM007_BASE_REF` | `main` | **仅反向验证使用**：取此 ref 中的原文作为"改动前版本" |

> `tools/history-language.mjs` 会启动真实浏览器，只读写被测页面的 LocalStorage，
> 不写仓库文件、不发起外部请求。
> `negative-history-language.mjs` 会临时改写 **4 个**被测文件（`history.html` /
> `history.js` / `language.js` / `translations.js`），
> 属**手工反向验证工具，不纳入普通 CI**；它用 `try/finally` + 文件快照保证还原，
> 并在结束时校验磁盘内容与备份一致。

### CM-008

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CM008_PORT` | `8899` | 自带服务器端口 |
| `CM008_BASE` | `http://127.0.0.1:8899` | 测试站点地址 |
| `CM008_NO_SERVER` | 未设置 | 设为 `1` 则复用外部服务器 |
| `CM008_CDP_PORT` | `9449` | Chrome 调试端口（避开与 CM-004/006 重复的 9446、以及落在动态端口范围的 9445） |
| `CM008_CHROME` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Chrome 路径 |
| `CM008_LOG` | 未设置 | 设置后把实跑输出落盘到该路径 |
| `CM008_BASE_REF` | `main` | **仅反向验证使用**：取此 ref 中的原文作为"改造前版本" |

> `tools/receipt-lifecycle.mjs` 会启动真实浏览器，用 fetch 桩**完全离线**模拟
> webhook 与 JSONBin 回执，不产生任何真实外部请求；只读写被测页面的 LocalStorage。
> **单次运行约 2 分钟**（含两处约 32s 的超时窗口，用于越过轮询自身的超时点）。
> `negative-receipt-lifecycle.mjs` 会临时改写 `js/modules/notification.js`，
> 属**手工反向验证工具，不纳入普通 CI**；全流程约 4 分钟。

### CM-010

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CM010_PORT` | `8899` | 自带服务器端口 |
| `CM010_BASE` | `http://127.0.0.1:8899` | 测试站点地址 |
| `CM010_NO_SERVER` | 未设置 | 设为 `1` 则复用外部服务器 |
| `CM010_CDP_PORT` | `9450` | Chrome 调试端口 |
| `CM010_CHROME` | 由 `tools/chrome-path.mjs` 解析 | Chrome 路径（一般不用设，设 `CHROME_PATH` 即可） |
| `CM010_BASE_REF` | `main` | **仅反向验证使用**：取此 ref 的原文作为"改造前版本" |

> `password-gate.mjs` 通过**预置 LocalStorage + 重新加载**走真实的
> `main.js → password.init()` 路径，并用页面内 `await import('/js/modules/password.js')`
> 直接调 `verify` / `setPassword` / `clearPassword`。
> 它不发任何外部请求（不触网、不碰 webhook）。
> `negative-password-gate.mjs` 会临时改写 `js/modules/password.js` 与
> `js/modules/translations.js`，属**手工反向验证工具，不纳入普通 CI**。

## 覆盖的验收路径

### CM-002（`e2e.mjs`）

对齐 CM-002 验收标准，脚本化后逐条断言：

1. 打开按钮编辑窗口
2. 新增自定义按钮 → 选择具体图标（fire）
3. 保存 → 校验 `localStorage.buttonConfig`
4. **再次打开编辑窗口**（原 bug 触发路径）→ 校验表单渲染与回显
5. 修改文字与图标（star）→ 保存
6. **刷新页面** → 校验持久化与 UI 回显
7. 改为 `random` → 保存 → 重新打开校验回显
8. 回归：删除自定义按钮
9. 回归：默认按钮编辑路径
10. 全流程无未捕获异常 / `console.error`

### CM-003（`storage-resilience.mjs`）

对齐 CM-003 验收标准，对三个 key 分别注入非法 JSON 与错误顶层类型（共 **51** 项断言）：

**只读路径（用例 1–4c）**

1. `userProfile` 非法 JSON → 首页可加载、回退未注册、无未捕获异常
2. `userProfile` 错误类型（数组 / 字符串 / 数字）
3. `notificationHistory` 非法 JSON → 历史页可加载并显示空状态
4. `notificationHistory` 错误类型（对象 / 数字 / 字符串）
5. `buttonConfig` 非法 JSON → 回退 `CONFIG.buttons.defaultButtons`
6. `buttonConfig` 错误类型（数组 / 字符串 / 数字）
7. `buttonConfig` 合法但 `buttons` 非数组 → 回退默认
8. 合法旧数据不回归（按钮配置 / 历史记录 / 用户昵称）

**写入路径（用例 5–5c，返工补充）**

9. `notificationHistory` 损坏（非法 JSON / 对象 / 字符串）后调用
   `notification.addHistoryRecord()` → 不抛异常、新记录写入成功、内容正确
10. 损坏 history 后走完整 `sendNotification()` 流程（**fetch 用桩控制状态码**）
    → HTTP 200 与 HTTP 500 两条分支都不抛异常，且历史写入状态分别为 `success` / `error`
11. 合法 history 在写入路径上未被吞掉 → 既有记录保留、新记录入队首

> **为什么补写入路径**：`readJsonSafe` 在只读路径上刻意保留损坏的原始值（供排查），
> 但 `addHistoryRecord` 是**写入**路径。返工前它仍是直接 `JSON.parse`，
> 用户一旦历史损坏，每次发通知（成功和失败两条分支）都会抛 `SyntaxError` ——
> 尤其 `notification.js:122` 那条是**记录失败时**抛的，等于错误上报机制本身失效。
> 现改为复用 `readJsonSafe` 并用新记录覆盖损坏值，让历史功能自我修复。

**fetch 桩的必要性**：用例 10 必须能分别走到成功与失败分支，
所以脚本在页面内替换 `window.fetch`，而不是真的打 webhook。
注意页面每次导航后 `window` 是新的，桩必须重新装。

### CM-002（`e2e.mjs`）运行方式变更（2026-09-17）

`e2e.mjs` 原先要求**先在另一个终端常驻 `server.mjs`**。本机子进程不能跨 Bash
命令存活，所以实际执行时服务器总是已经死掉，页面停在 `chrome-error://chromewebdata/`，
报出来的却是 `SecurityError: Failed to access localStorage` —— 极具误导性。

现已改为与 CM-003/CM-004 相同的模式：**脚本进程内自建静态服务器**，
单条 `node tools/e2e.mjs` 即可。若确需复用外部服务器，设 `CM002_NO_SERVER=1`。

### CM-004（`button-ids.mjs`）

对齐 CM-004 验收标准，共 **52** 项断言，分 8 个用例：

| 用例 | 覆盖内容 |
|---|---|
| 1 | 无配置启动 → 落盘规范 ID 默认按钮；保存后 ID 为 `quick_online` / `emergency` |
| 2 | legacy `default_N` 配置：读取不崩、渲染内容完整、保存后迁移为规范 ID 且文案/图标不丢 |
| 3 | legacy `custom_<timestamp>` 配置：编辑保存后**原 ID 不变**，未编辑按钮内容与 ID 均不变 |
| 4 | 新建自定义按钮：同批次两个 ID 互不相同；连续保存 / 刷新后再保存 ID 不变 |
| 5 | 删除中间自定义按钮 + 编辑默认按钮：存活按钮 ID 不被连带改变 |
| 6 | 未知字段（`color` / `weight` / `tag` / 嵌套对象）在保存后保留 |
| 7 | 回归：新增 → 选图标 → 保存 → 重开回显 → 首页渲染 → 可点击 |
| 8 | 幂等：同一份规范配置连续保存 3 次，ID 序列完全稳定 |

> **用例隔离**：`injectAndLoad` 每次先 `localStorage.clear()` 再注入，
> 所以脚本可**重复运行**且用例互不污染。传 `buttonConfig: null` 表示"刻意不注入该 key"，
> 用于验证「无配置 → 自动落盘默认」的路径。
> （最初没做隔离，用例 1/4 会继承上一轮 profile 残留数据而误报 —— 已修正。）

**反向验证的三处回退点**（`negative-button-ids.mjs`）：

1. `saveButtonConfig` 默认按钮 ID 回到按位置生成 `default_N`
2. `saveButtonConfig` 自定义按钮 ID 回到每次重新生成 `custom_${Date.now()}`
3. `loadButtonConfig` 去掉 `normalizeButtonIds` 调用（不做 legacy 归一化）

回退后 12 项断言失败，最能说明缺陷的两条：

```text
同一批次两个新按钮 ID 互不相同
  -> ["custom_1789653535321","custom_1789653535321"]   ← 两个按钮共用一个 ID
连续 3 次保存 ID 序列完全稳定
  -> ["…default_1,default_2,custom_1789653541862",
      "…custom_1789653541865",
      "…custom_1789653541869"]                        ← 每次保存 ID 都在漂移
```

**这正是原缺陷的真实危害**：同一毫秒内新增多个按钮会**共用一个 ID**，
而每次保存都会重写所有未编辑按钮的 ID —— 身份不稳定，跨刷新无法对应。

### CM-005（`input-safety.mjs`）

对齐 CM-005 验收标准（含 icon 白名单返工），共 **97** 项断言，分 9 个用例：

| 用例 | 覆盖内容 | 断言数 |
|---|---|---|
| 1 | 首页按钮渲染：恶意 `message`（`<script>` / `<img onerror>`）与恶意 `icon` | 9 |
| 2 | 按钮编辑表单：恶意 `message` 经 `value` **完整回显**，不产生额外属性 | 7 |
| 3 | 恶意 icon：不注入 class，且**不静默丢失原值** | 15 |
| 3b | **严格允许列表**：白名单外的历史值不进入 class，且保存保留原值 | 29 |
| 4 | 自定义按钮表单：结构注入载荷（`</span><b id="inj">`）只作文本 | 6 |
| 5 | 历史渲染：恶意 `nickname` / `message` / `emoji` / `webhook` | 9 |
| 6 | 历史 `_status`：未知值不产生状态 class；`success` / `error` / 缺失三种情形不回归 | 10 |
| 7 | 合法数据不回归：`fire` / `random` / `star` 渲染、文案、`data-button-index`、选择器回显 | 11 |
| 8 | 全流程无未捕获异常 / `console.error` | 1 |

**判定"注入未发生"的四类独立证据**（每类都单独断言，不靠单一信号）：

1. `window.__pwned` 未被设置 —— 脚本或事件属性**确实没有执行**
2. 容器内不存在 `SCRIPT` / `IMG` / `SVG` / `IFRAME` 等注入元素
3. 容器内不存在任何 `on*` 事件属性
4. 恶意串以**字面文本**出现在 `textContent` 中 —— 证明是被当作文本渲染，
   而不是被过滤掉或当作 HTML 解析

> 第 4 条是刻意设计的：只断言"没有报错/没有 pwned"会把"把内容整个过滤掉"
> 也算成通过，而那会破坏功能。文本必须在，且必须仍是文本。

#### 图标：严格允许列表 + 未知历史值的定义行为

返工后的策略是**闭集允许列表**，不再有"安全字符集正则"兜底 ——
正则挡不住"任意合法 token"，例如 `not-configured` 会被渲染成 `fa-not-configured`，
于是 class 的内容由**数据**而不是由**配置**决定。

```text
允许列表 = CONFIG.buttons.availableIcons（18 个）+ "random"（选择器的随机语义）
渲染     = 列表内 → 原样；列表外 → FALLBACK_ICON("random")
保存     = dataset.value 携带**原始值**，用户未改图标时原样写回
```

三个必须分清的概念（混用会互相打架）：

| 概念 | 值 | 说明 |
|---|---|---|
| 存储值 | 任意 | 来自 LocalStorage，可能在允许列表外；**不因显示兜底而被改写** |
| 首页按钮字形 | `displayIcon(存储值)` | 列表外 → `fa-random` |
| 选择器字形 | `pickerGlyph(...)` | `random` 语义用表现层常量 `shuffle` → `fa-shuffle` |

> `displayIcon`（存储值 → 字形）与 `pickerGlyph`（表现层常量）必须分开。
> 早期版本把 `"shuffle"` 也交给 `displayIcon`，它被判成白名单外并回退成 `random`，
> 于是随机选项显示 `fa-random`、触发按钮显示 `fa-shuffle` —— **同一控件内自相矛盾**。
> 该矛盾由用例 3b 的"每个选项的图标 class 与自身 data-value 一致"捕获。

**未知历史 icon 的定义行为**（返工要求）：

- **显示**：回退为允许列表内的图标；选择器不点亮任何选项（不假装用户选了随机）
- **保存**：`dataset.value` 保留原值 → "打开编辑 → 不碰图标 → 保存"原样写回
- **用户主动改选**：写入新的合法值（"保留"不等于"锁死"）

> 首页按钮渲染 `"random"` 用 `fa-random`、选择器预览用 `fa-shuffle`，
> 这个差异是**修复前就存在的**，本次保持不变（属表现层既有状态，不在本任务范围）。

#### 反向验证（`negative-input-safety.mjs`）

与前几个任务的做法不同：**不手写回退片段**，而是用 `git show <ref>:<file>`
取出**基线分支的原文**覆盖当前文件 —— 回退的就是真正的缺陷版本，
避免"手写回退与真实历史有偏差"造成的假结论。

```text
修复版本退出码 : 0 (预期 0)          断言：97 passed, 0 failed
回退版本退出码 : 1 (预期非 0)        断言：65 passed, 32 failed
回退版本注入类失败项     : 17 条 (预期 > 0)
回退版本允许列表类失败项 :  4 条 (预期 > 0)
源码已还原     : true (预期 true)
```

回退版本的关键证据：

```text
FAIL  首页按钮容器：无元素注入（无 SCRIPT/IMG/SVG 等） -> ["IMG","SCRIPT","IMG"]
FAIL  首页按钮容器：无事件属性注入（无 on* 属性）      -> ["IMG@onerror","IMG@onerror"]
FAIL  首页按钮容器：脚本/事件未执行（__pwned 未设置）  -> true        ← 脚本真的执行了
FAIL  表单 value 完整回显恶意 message（未被截断/逃逸） -> ""          ← value 属性被突破
FAIL  白名单外的 not-configured 不渲染为 fa-not-configured
      -> "fas fa-not-configured"                                    ← 主指挥初审的反例
FAIL  白名单外的 circle 同样回退（无对应翻译键，不进入 class）
      -> "fas fa-circle"
FAIL  未改动图标时原值被原样保留（不静默丢数据） -> "bolt"              ← 原实现在引号处截断
FAIL  选择器 dataset.value 保留原始值（保存回写载体） -> "(missing)"    ← 元素身份被属性突破破坏
```

`__pwned = true` 是**真实执行**的直接证据（不是"可能被注入"的推断）；
`value -> ""` 与 `dataset.value -> "(missing)"` 说明属性突破路径在修复前可达，
且会破坏输入框内容与元素身份（功能损坏，不只是安全问题）。

> **为什么反向验证还要求"失败项必须命中修复点关键字"**：只比较退出码会把
> 端口占用、Chrome 起不来等基础设施抖动误读成"测试有效"。
> 脚本因此额外断言：修复版汇总为 `0 failed`，且回退版失败项中
> **同时**包含注入类与允许列表类关键字。

### CM-006（`cooldown.mjs`）

对应 `docs/TECH_DEBT.md` 的 **CM-001-TD-05**：冷却状态由多个模块重复维护。

**收敛后的唯一责任者**：`js/modules/countdown.js`。
它独占三件事 —— 冷却状态转换（`state.canClick`）、`lastClickTime` 持久化、
倒计时 timer 生命周期；其他模块只调用它的接口。

> 为什么放在 `countdown.js` 而不是 `state.js`：`state.js` 在模块导入期就执行，
> 早于 DOM 就绪；若要它承担恢复逻辑，就得反向导入 `countdown` 来驱动显示，
> 形成 `state ⇄ countdown` 循环依赖。放在 `countdown` 可保持依赖单向。

对外接口：

| 接口 | 用途 |
|---|---|
| `restore()` | 页面加载 / 刷新：按 storage 恢复，或清理不可用的值 |
| `startFromNow()` | 用户点击：以当前时间为起点开始冷却 |
| `cancel()` | 请求失败回滚：放行 + 清除持久化 + 停 timer |
| `remaining()` | 只读：剩余秒数（提示文案与断言用） |
| `init()` / `updateDisplay()` | 显示层初始化与刷新 |

**时间戳的定义行为**（全部有断言覆盖）：

| 存储值 | 行为 |
|---|---|
| 缺失 / 空串 | 无冷却，放行；不写 storage |
| 非数字 / `NaN` / `Infinity` / `0` / 负数 | 视为非法：**清除该 key** 并放行（沿用既有清理语义） |
| 已过期 | **清除该 key** 并放行 |
| 未来时间戳 | 视为"刚点击过"，剩余 **clamp 到 `CONFIG.cooldownTime`** |
| 合法且未过期 | 按其剩余时间进入冷却，**不重写**存储 |

> 「未来时间戳 clamp」是本任务新增的定义：旧实现会算出 `60 + 偏移量` 的剩余时间
> 并直接启动倒计时 —— 时钟被向前校正一小时后，用户会被锁死 **3660 秒**。
> 回退版实测的显示文本 `"冷却中，3660秒后可再次发送"` 即为此缺陷的直接证据。

**观测手段（生产代码零测试钩子）**：

1. 页面内用 `await import('/js/modules/state.js')` 取到应用**正在使用的同一模块实例**
   （ESM 模块记录按 URL 缓存），因此能读到真实的 `state.canClick` / 剩余秒数。
2. 用 CDP `Page.addScriptToEvaluateOnNewDocument` 在页面脚本之前包装
   `setInterval` / `clearInterval` / `setTimeout`，得到可量化的
   「已武装 interval 数」与「长延时 timeout 数」。
3. 用一个 fetch 桩替换 `window.fetch` 模拟成功/失败，**完全离线**。

**断言分组（87 项）**：

| 场景 | 覆盖 |
|---|---|
| S1 首次加载 | 放行、无 timer、无 key、接口齐全 |
| S2 刷新恢复 | 剩余时间、元素激活、文本、key 保留、**无长延时 timeout** |
| S3 归零 | 放行、清 key、interval 释放、元素取消激活 |
| S4/S5 请求成功与重复点击 | 单次写入、冷却期间被阻止、不重复写 key、不叠加 timer |
| S6 失败回滚 | 立即放行、清 key、释放 timer；重试成功后重新进入冷却 |
| S7/S8 非法与过期 | 7 种非法值 + 过期值均清理并放行 |
| S9 未来时间戳 | clamp 到 60 且显示文本不含 3660 |
| S10/S11 timer 去重 | 重复调用后恒为 1 个 interval；**手工执行旧代回调不得改写新状态** |
| S12 页面异常 | 无未捕获异常 / 非预期 `console.error` |
| S13 同源性扫描 | 5 个源码中只有 `countdown.js` 触碰 key 与 `canClick` |

> S12 允许 **1 条预期内的 `console.error`** —— 失败回滚场景故意让 fetch 抛错，
> 应用自身的 `catch` 会记录 `Fetch error:`。脚本把它单独归类，不计入非预期错误。

**反向验证（`negative-cooldown.mjs`）实测**：

```text
已收敛版本退出码 : 0          断言：87 passed, 0 failed
回退版本退出码   : 1          断言：65 passed, 22 failed
源码已还原       : true
```

回退版本的关键证据（旧实现的分散程度，由 S13 源码扫描直接量化）：

```text
state.js          keyRefs=6  canClickAssign=4  setTimeout=1
main.js           keyRefs=4  canClickAssign=2  setTimeout=1
buttonManager.js  keyRefs=7  canClickAssign=3  setTimeout=1
notification.js   keyRefs=1  canClickAssign=0  setTimeout=4
countdown.js      keyRefs=1  canClickAssign=2  setTimeout=0   ← 收敛后只剩它

FAIL  未创建长延时 timeout（旧实现的恢复定时器） -> longTimeouts=2
FAIL  显示文本为 60 秒且未出现 3660 -> "冷却中，3660秒后可再次发送"
FAIL  仅 countdown 触碰 lastClickTime key      ← 旧实现有 4 个模块写同一个 key
FAIL  责任者提供 restore / startFromNow 接口 -> countdown.restore is not a function
```

`longTimeouts=2` 是**重复定时器的直接观测**：旧实现每次进入冷却都会额外创建
两个不可取消的 `setTimeout`（`state.checkCooldownStatus` 与 `main.checkCooldown` 各一个），
叠加 `countdown` 自己的 `setInterval`，一次冷却共 **3 个计时器**。

> **区分力判定同时要求**：修复版 `0 failed`、回退版退出码非 0、
> 且回退版失败项**命中"写入点唯一"与"定时器去重"两类关键字** ——
> 只比较退出码会把基础设施抖动误读成"测试有效"。

### CM-007（`history-language.mjs`）

对应 `docs/TECH_DEBT.md` 的 **CM-001-TD-06**：历史页没有语言初始化，反馈文案硬编码中文。

**做法**：历史页复用首页的语言初始化与回退规则，不新建语言状态。

| 关注点 | 实现 |
|---|---|
| 语言来源 | `history.js` 在 `init()` 里调用 `language.init()` —— 读取 `appLanguage`、校验是否受支持、落到 `state.currentLang` |
| 查找翻译 | 沿用 `utils.getTranslation()`（读的正是首页那份 `state.currentLang`），不建第二张表 |
| `language.js` 的改动 | **只加元素存在性判断**（`init(domElements = {})` + 各方法守卫）。历史页没有语言切换控件，而 `bindEvents()` 注册的全局 click 监听会调用 `hideLanguageMenu()`，不判断就会在历史页任意点击时抛 `TypeError` |
| 页面文案 | `history.js` 的 `applyPageTexts()` 覆盖文档标题 / 顶部标题 / 返回按钮 title / 清除按钮 title；空状态与 Webhook 标签在 `render()` 内、清除 toast 在 `clear()` 内 |

**新增翻译键**（`history.*`，四语言齐全）：

| 键 | zh | en | ja | ko |
|---|---|---|---|---|
| `pageTitle` | 通知历史 | Notification History | 通知履歴 | 알림 기록 |
| `backTitle` | 返回 | Back | 戻る | 뒤로 |
| `clearTitle` | 清除记录 | Clear records | 記録を消去 | 기록 지우기 |
| `cleared` | 历史记录已清除 | History cleared | 履歴を消去しました | 기록이 지워졌습니다 |
| `webhookLabel` | Webhook | Webhook URL | Webhook URL | Webhook 주소 |

> ⚠️ **`zh.webhookLabel` 必须保持 `Webhook`** —— 这是一条**跨任务兼容约束**：
> `tools/input-safety.mjs:1024`（CM-005）把 `Webhook: ` 这个前缀钉进了期望字符串
> （`f.err === \`Webhook: ${...}\``）。该文件不在 CM-007 的 SCOPE 内、未作修改，
> 因此 zh 取值不能改。若将来要把它改成「Webhook 地址」一类更具体的说法，
> 必须同时更新 `input-safety.mjs` 的那条断言。
> `history-language.mjs` 已把这条约束写成显式断言，避免以后被静默改坏。

**观测手法**：
1. Node 侧直接 `import { TRANSLATIONS }`（纯数据模块，无 DOM 依赖）做表级检查：
   四语言键齐全、四个本地化键取值互不相同（防止把英文串复制到其他语言）、少量 golden 值。
2. 页面侧读 DOM 实际渲染值，与该语言在表里的值逐项比对；
   回退场景的期望值按既有规则在页面内用 `navigator.language` 现算，不写死。
3. 历史输入安全单独覆盖：恶意 message/nickname/emoji/webhook 仍只作文本，
   非法 `_status` 不注入 class，且 `innerHTML` 中不含真实标签。

**断言分组（107 项）**：

| 场景 | 覆盖 |
|---|---|
| T1/T2 翻译表 | 四语言六个键齐全非空；四个本地化键取值互不相同；golden 值；`zh.webhookLabel` 兼容约束 |
| T3 四语言静态文案 | 文档标题 / 顶部标题 / 返回 title / 清除 title / 错误行 Webhook 标签 |
| T4 空状态 | 四语言空状态文本；`notificationHistory` 缺失时同样走空状态 |
| T5 记录渲染 | 条数、状态 class、昵称/消息/emoji 文本、success 行不显示 Webhook 标签 |
| T6 语言回退 | 未设置 / 非法 `fr` / 空串 → 按既有规则回退，且不阻断页面 |
| T7 清除动作 | 只删 `notificationHistory`（其余 4 个 key 原样）、toast 跟随语言、清除后回到空状态 |
| T8 输入安全 | `__pwned` 未设置、无注入元素、无 `on*`、非法 class、恶意字段为字面文本 |
| T9 首页不回归 | 四语言下首页标题/副标题/语言指示器/用户名；语言菜单可开可关 |
| T10 页面异常 | 无未捕获异常 / `console.error` |

**反向验证（`negative-history-language.mjs`）实测**：

```text
已支持版本退出码 : 0          断言：107 passed, 0 failed
回退版本退出码   : 1          断言：65 passed, 42 failed
源码已还原       : true
```

回退版本的关键证据（改动前的真实表现）：

```text
FAIL  en: 文档标题 = undefined -> "通知历史"          ← 英文下标签页标题是中文
FAIL  en: 返回按钮 title = undefined -> "返回"
FAIL  en: 清除按钮 title = undefined -> "清除记录"
FAIL  en: 错误行标签 = undefined -> "Webhook: https://..."   ← 硬编码前缀
FAIL  zh.history 六个键齐全且非空 -> 缺: pageTitle,backTitle,clearTitle,cleared,webhookLabel
FAIL  pageTitle 四语言取值互不相同 -> [null,null,null,null]
```

> **区分力判定同时要求**：已支持版本 `0 failed`、回退版本退出码非 0、
> 且回退版失败项**同时命中"页面文案本地化"与"翻译表完整性"两类关键字**。

### CM-008（`receipt-lifecycle.mjs`）

对应 `docs/TECH_DEBT.md` 的 **CM-001-TD-07**：所有回执轮询更新同一 `#receiptStatus`，
timer 不保存在状态中，新请求无法取消旧请求。

**改造前**：`pollReadStatus()` 用递归 `setTimeout(poll, 2000)`，**不保存句柄、无取消机制**；
一旦启动最长跑 ~32s。两次发送重叠时，旧轮询读到旧 `msgId` 的 read 或走到 timeout，
会把新消息的状态条覆盖掉。

**改造后**（做法与 CM-006 `countdown.generation` 一致）：

| 关注点 | 实现 |
|---|---|
| 状态 | `notification.receiptPollTimer`（句柄，null = 无已排队轮询）+ `receiptPollGeneration`（代际） |
| 停止 | `stopReceiptPolling()`：自增代际 + `clearTimeout` + 句柄置 null。**不写状态条** |
| 单一所有权 | `pollReadStatus()` 启动前先 `stopReceiptPolling()` → 同一时刻活跃轮询 ≤ 1 |
| 旧轮询失效 | 回调入口、`await fetch` 之后、`await res.json()` 之后**三处**校验代际；不等则直接返回，不写状态条（含 timeout 分支） |
| 终态 | read 命中 / 15 次超时：先清句柄再写状态条，使「句柄非空」⇔「有轮询在等待」 |
| 参数遮蔽 | `setReceiptStatus(state)` → `setReceiptStatus(statusName)`（原参数名遮蔽了导入的 `state` 模块） |

> 刻意**不用 AbortController**：那会改动既有 JSONBin 读取方式（NON-GOALS）。
> 代际校验已足以保证旧轮询不写状态条；旧轮询在飞的请求返回后被直接丢弃。

**单次行为不变**：每 2s 一次、最多 15 次（约 32s），read/timeout 语义与文案不变；
`binUrl` 缺失或 `msgId` 为空时直接返回（保持原有宽容语义）。

**★ 如何量化「旧轮询真的死了」**：不看定时器计数（易受 toast 等干扰），
而看**旧轮询是否还在发请求** —— 若两个轮询并存，32s 窗口内的 JSONBin 请求数会接近翻倍。

**断言分组（54 项）**：

| 场景 | 覆盖 |
|---|---|
| S0 前置 | 模块可导入、配置里有 `jsonBin.binUrl` |
| S1 单次发送 → read | sent 起步、轮询在等、2s 内 1 次请求即命中、命中后句柄清空 |
| S2 单次发送 → timeout | 共 **15 次** bin 请求、耗时落在 30–36s、超时后句柄清空 |
| S3 并发打断（核心） | 第二次发送时第一次仍在跑：代际自增、状态条重新从 sent 开始、第二次读到 read；**越过后第一次的原超时点，状态条仍为 read** |
| S4 宽容语义 | `msgId` 空/缺失、`binUrl` 缺失：不抛异常、不启动轮询、不发请求 |
| S5 可取消性 | `stopReceiptPolling()` 后越过原超时点：状态条不被改写、不再发请求、无活跃轮询 |
| S6 定时器计数 | 待触发的 2000ms 定时器数量作为**辅助**证据（容忍 toast，`notificationDuration = 4000`） |
| S7 同源性 | 参数名已改、轮询的 `setTimeout` 全部被句柄接住、终态清句柄（Node 侧扫源码） |
| S8 页面异常 | 无未捕获异常 / `console.error` |

> **并发场景用直接调用被测模块而不是点两次按钮**：CM-006 之后点击链路会启动 60s 冷却，
> 第二次点击会被闸门拦掉，根本进不到 `sendNotification`。
> 点击链路本身由 S1/S2/S5 覆盖。

**反向验证（`negative-receipt-lifecycle.mjs`）实测**：

```text
已改造版本退出码 : 0          断言：54 passed, 0 failed
回退版本退出码   : 1          断言：31 passed, 20 failed
源码已还原       : true
```

回退版本的关键证据（★ 两条是本任务的核心缺陷，且数值与设计预期吻合）：

```text
FAIL  ★ 旧轮询的超时分支未覆盖新状态条（仍为 read） -> receipt-status timeout
FAIL  ★ 旧轮询已停止发请求（bin 请求 ≤ 6）        -> binCalls=16
FAIL  提供 stopReceiptPolling 接口 -> 旧实现没有该接口
FAIL  旧轮询已被失效（代际自增） -> null -> null
FAIL  不再有遮蔽模块 state 的参数名 -> hasShadowParam=true
FAIL  轮询的 setTimeout 全部被句柄接住 -> bare=2, handled=0
```

> `binCalls=16` 与设计预期一致：第一次轮询在交接前已跑 2 次、之后继续跑到第 15 次
> （共 15 次请求），第二次轮询再发 1 次 → 16。改造后只需 **3 次**（2 + 1）。

> **区分力判定同时要求**：已改造版本 `0 failed`、回退版本退出码非 0、
> 且回退版失败项**同时命中"取消能力"与"并发隔离"两类关键字**。

### CM-010（`password-gate.mjs`）

对应 `docs/SECURITY.md` 的威胁模型：访问提示是 **UI 级提示、不是安全边界**，
因此代码、文案、文档三者必须表述一致且诚实。

**改动前的问题**：

| 问题 | 位置 |
|---|---|
| 密码配置**重复定义** | `config.js` 的 `defaultPassword`/`expiryDays` 与 `password.js` 的 `'666888'`/`7` 各存一份，后者从不读 config |
| 文案**不诚实** | `password.hint` 声称「密码每周更新，请联系管理员获取最新密码」—— 实际没有任何每周更新机制，密码就是源码里的常量 |
| 坏数据**反而放行** | `parseInt` 结果是 NaN 时 `(Date.now() - NaN) > expiry` 恒为 `false` → 时间戳损坏时**永远不要求验证** |

**改造后**：`password.js` 从 `CONFIG.password` 读默认密码与有效期（单一来源）；
四语言 `hint` 改为诚实表述（明确说明"任何能打开本页的人都能绕过它"）；
损坏时间戳按「已过期」处理。

**断言分组（60 项）**：

| 场景 | 覆盖 |
|---|---|
| S0 前置 | 模块可导入、`CONFIG.password` 两个字段存在 |
| S1 触发语义 | 无 key / 空串 / 3 天前 / 第 6 天 / 超 7 天 → 弹或不弹；5 种损坏时间戳 → 均弹窗 |
| S2 验证交互 | 错密码 → 报错文案 + 弹窗仍在 + 不写时间戳；默认密码 → 弹窗关闭 + 写时间戳 |
| S3 模块语义 | `verify` 默认/错误；`setPassword` 覆盖生效；`clearPassword` 回退默认密码 |
| S4 诚实文案 | 四语言 hint：不含安全性暗示词、**不声称"每周更新/联系管理员"**、**明确说明可被绕过**、与翻译表一致、四语言互不相同 |
| S5 单一来源 | `password.js` 无默认密码字面量 / 无 `PASSWORD_EXPIRY_DAYS` / 无 `correctPassword` / 从 `CONFIG.password` 读；`js/` 下字面量只命中 `config.js` |
| S6 页面异常 | 无未捕获异常 / `console.error` |

> **S4 为什么不能只查禁用词**：旧文案「密码每周更新，请联系管理员获取最新密码」
> **并不含**「保护/安全/加密/授权」，所以只查禁用词会在旧代码上"通过"。
> 因此额外断言两件事：**不声称不存在的机制**，以及**主动说明可被绕过** ——
> 这两条才是真正对旧文案有区分力的判据。

**反向验证（`negative-password-gate.mjs`）实测**：

```text
已改造版本退出码 : 0          断言：60 passed, 0 failed
回退版本退出码   : 1          断言：43 passed, 17 failed
源码已还原       : true
  单一来源类失败 5 条 · 诚实文案类失败 8 条 · 损坏时间戳类失败 4 条
```

回退版关键证据：

```text
FAIL  password.js 不含默认密码字面量 -> 666888
FAIL  password.js 从不读 CONFIG（无 CONFIG.password）
FAIL  js/ 下默认密码字面量只命中 config.js 一处 -> ["config.js","password.js"]
FAIL  zh: hint 不声称"每周更新/联系管理员" -> 命中 ["每周","管理员","更新"]
FAIL  zh: hint 明确说明"能被绕过" -> 缺少 "绕过"
FAIL  时间戳损坏 "abc" → 弹窗 -> hasModal=false
```

> **基线漂移提醒**：本改造合并进 `main` 后，默认 `CM010_BASE_REF=main` 会失效
> （exit 2「没有可回退的改动」）→ 须显式指定改造前 commit。

> **行为收紧（有意）**：损坏时间戳从"不弹窗"变为"弹窗"。任务卡写的是
> 「按已过期处理」并注「与现状 parseInt 行为对齐」，但现状并不弹窗
> （`NaN > x` 恒为 false）。已按**显式的行为要求**实现，并在此记录这处偏离。

> **SCOPE 位置说明**：任务卡把文案列在 `js/modules/language.js`，
> 但四语言文案实际住在 `js/modules/translations.js`（`language.js` 内无文案）。
> 改动落在实际位置，反向验证覆盖的也是这两个文件。

### `check-worktree.mjs` / `scripts/worktree-guard.mjs`（环境防护，非任务测试）

本仓库在 Windows 上反复出现**已跟踪文件在工作区被级联删除**的问题
（2026-09-17 三次；2026-09-18 两次；2026-09-19 CM-007/008/009 与 GOV-002 四次）。
根因、证据与完整时间线见
[`../docs/handoff/archive/WORKTREE-FILE-LOSS.md`](../docs/handoff/archive/WORKTREE-FILE-LOSS.md)。

**根因一句话**：git 删除工作区文件后会沿路径**逐级 `rmdir` 祖先目录**，靠「目录非空 → 失败」终止；
本机沙箱把删除改写为「移入回收站」且**不校验目录是否为空**，终止条件失效 → git 一路删到工作树顶层，
同目录内**未被 git 重写**的已跟踪文件就此静默消失。

两个脚本分工：

```bash
# 手动：切换/合并后主动检查，--fix 从 HEAD 恢复
node tools/check-worktree.mjs
node tools/check-worktree.mjs --fix

# 自动：由 git 钩子驱动（需先 git config core.hooksPath .githooks）
# 守卫本体在 scripts/ 下（**不在 tools/**），一般由钩子调用，无需手动执行
node scripts/worktree-guard.mjs post-checkout <prev> <new> <flag>
node scripts/worktree-guard.mjs post-merge <squash>
node scripts/worktree-guard.mjs post-commit
```

#### 为什么守卫不在 `tools/`（GOV-002 根因修复）

守卫原来住在 `tools/worktree-guard.mjs` —— 而 `tools/` 正是会被级联搬走的目录之一，
于是**守卫与被保护物同归于尽**：钩子报 `MODULE_NOT_FOUND`，恢复从未发生。
四次事故同一根因。现在的三层设计：

| 层 | 位置 | 作用 |
|---|---|---|
| 1 | `scripts/worktree-guard.mjs` | 权威版本（已移出 `tools/`），随仓库分发 |
| 2 | `<git-dir>/worktree-guard.mjs` | **每次运行时自安装**的副本。`.git/` 在工作树之外，级联搬不到它 |
| 3 | `.githooks/*` 内联的纯 git 回退 | 前两层都没有时，直接 `git restore` 恢复 `--diff-filter=D HEAD` 的文件 |

钩子按 1 → 2 → 3 依次尝试，任一层可用即可完成恢复。

**实测证据（2026-09-19）**：把 `scripts/worktree-guard.mjs` 从工作树移除后再触发钩子，
守卫横幅仍出现且受害文件被恢复 → 证明用的是第 2 层的 `.git/` 副本而非常规路径。

`worktree-guard.mjs` 的判定规则：

```text
intended   = git diff --diff-filter=D <prev> <new>   # 本次操作本来就要删的 → 不恢复
missing    = 索引里已跟踪、但工作区已不存在的文件
collateral = missing - intended                       # 级联误伤 → git restore
```

**用 `CALLME_WT_GUARD=0` 可临时关闭守卫。**

**日志**：`.workbuddy/worktree-guard.log`。**只有在真的恢复过文件时才会写** ——
`collateral` 为空时脚本直接退出，不产生日志。所以「没有日志」≠「防线失效」，
反之「有日志」才说明发生过误伤。

**用法纪律**：在 git 合并/检出之后、**任何 commit 之前**跑一次 `node tools/check-worktree.mjs`。
若看到 ` D` 条目，**先恢复再继续** —— 不要带着缺失状态跑验证（会误判成代码回归），
更不要 `git add -A`（会把工作区损坏固化进历史）。

**自助恢复（不需要 AI，3 条命令）**：`git status` 看到一批 ` D` → `git restore -- .`（只写不删）→
`git status` 应干净。前提是**没有要保留的未暂存改动**；级联事故的场景恰好满足。

> ⚠️ **防线本体（`.githooks/*`、`scripts/worktree-guard.mjs`）必须纳入版本控制。**
> 若它们被级联 bug 或 `git clean` 清掉，**防线会静默失效且没有任何提示**。
> 这也是第 2/3 层存在的理由 —— 不再把全部希望押在"工作树里的那个文件还在"上。

## 环境注意事项

**代理会劫持回环请求。** 若本机设置了 `HTTP_PROXY` / `HTTPS_PROXY`，
探测本地端口会返回 `HTTP 502` 而非连接拒绝，导致 Chrome 无法监听调试端口。
所有脚本已内置处理：

- Chrome 启动参数加 `--no-proxy-server --proxy-bypass-list=<-loopback>`
- spawn 前清空环境变量中所有匹配 `/proxy/i` 的键
- 探针使用 `node:http` 直连（**不能用 `fetch`**，它会被代理接管）

**Chrome 生命周期。** 脚本在自身进程内启动 Chrome、跑完断言后 `kill()`。
不要改成 `detached` 外部启动——子进程会随 shell 会话结束被回收，下条命令里端口就没了。

**服务器必须与浏览器同进程。** 单独一条命令后台起
`server.mjs`，下一条命令里端口就没了（子进程被回收）。CM-002 / CM-003 / CM-004 / CM-005
四个脚本因此都把静态服务器内联在同进程启动，避免这个陷阱。
不要改回"先起服务器再跑脚本"的三段式 —— 在本机会稳定失败。

**反向验证脚本要写"完整 FAIL 清单"，不能只有退出码。**
若被测代码在缺陷版本下直接抛异常中断，脚本会带着一个笼统的退出码 1 结束，
报告里看不到失败明细 —— **崩溃是钝的信号，可读的失败清单才是有效证据**。
CM-003 / CM-005 的修正方式相同：给可能缺失的元素查询加哨兵返回值
（如 `if (!el) return "(missing)"`），把"结构崩了"变成一条可读的 FAIL。
CM-005 加固前后对比：回退版本从"(无汇总)"变为 `36 passed, 28 failed` 的完整清单。

**CDP 下必须先导航到同源页面再写 localStorage。** 在 `about:blank`
上执行 `localStorage.setItem` 会抛 `SecurityError`。若导航失败（如服务器没起），
页面会停在 `chrome-error://chromewebdata/`，症状同样是 `SecurityError` ——
**别把「服务器没起」误判成「localStorage 不可用」**。

**`.js` 文件是 CRLF 行尾。** 做文本替换时必须先 `\r\n → \n` 归一化再匹配，
写回时还原为 `\r\n`；不要用含 `\n` 的固定字符串直接匹配。
`negative-storage.mjs` 与 `negative-button-ids.mjs` 都已内置 `readNorm` / `writeCRLF`。

**放在仓库树里的临时 `.mjs` 会被 lint 扫到。** ESLint 遍历整个仓库，
非 `tools/**` 的脚本会按"浏览器环境"检查（那里没有 `process` 等 Node 全局），
`no-undef` 会直接让 `lint` exit 1。

> CM-009 起 `.workbuddy/` 已加入 `eslint.config.js` 的 `ignores`，
> 所以一次性证据脚本放那里是安全的（该目录被 gitignore、不随仓库分发）。
> 但**仓库树其他地方**的临时脚本用完仍应立刻删。

**测试用例必须自带隔离。** `tools/*.mjs` 用的 Chrome profile 目录跨运行复用，
若用例只注入部分 key，会继承上一轮残留数据 → 首次全绿、复跑却失败。
`button-ids.mjs` 的 `injectAndLoad` 已改为**先 `localStorage.clear()` 再注入**，
用例之间互不污染、脚本可重复运行。

**反向验证不要用 `git stash`。** 2026-09-17 一次 `git stash` 失败后
`.git/refs/` 与对象库被清空，仓库一度不可用（靠 reflog + `fetch` 才恢复）。
改用纯文件备份/还原，并用 `try/finally` 保证异常时也还原。

**本机的 `npm` 命令本身不可用（CM-009 实测）。** 裸 `npm` 会去拉 `wsl.exe`，
被沙箱安全策略拦截：

```text
PROGRAM BLOCKED BY SECURITY POLICY ...
- wsl.exe (C:\Program Files\WSL\wsl.exe)
```

这不是脚本的问题。换用 npm 的**真实 JS 入口**即可正常执行 npm 脚本：

```bash
NODE="C:/Users/dd/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
NPM="C:/Users/dd/.workbuddy/binaries/node/versions/22.22.2-3/node_modules/npm/bin/npm-cli.js"
"$NODE" "$NPM" test          # 等价于 npm test
```

`package.json` 的脚本已全部指向**真实入口**（`lint` =
`node node_modules/eslint/bin/eslint.js .`），所以即使直接执行脚本内容、
完全绕开 npm，行为也一致：

```bash
node node_modules/eslint/bin/eslint.js .   # = npm run lint
node tools/run-all.mjs                     # = npm test
```

> 历史：本机 `node_modules/.bin/*` 是 POSIX shim、首行依赖 `dirname`，
> 在本机 bash 下必然失败（`dirname: command not found`），
> 所以过去 `npm run lint` 报 exit 1 **不是** ESLint 真报错。
> CM-009 把 npm 脚本改为直接调用真实入口后，这条不再影响 `lint` / `test`；
> `format` / `format:check` 仍走 prettier 的 `.bin` shim（不在 CM-009 范围内）。

**`node -e "..."` 在本机会被 shell 吃掉引号。** 含引号/正则的复杂内联脚本
（尤其 `-e` 里带 `'` 或 `|`）会被 MSYS 改写后抛 `SyntaxError`。
改为写成独立 `.py` / `.mjs` 文件再执行。
