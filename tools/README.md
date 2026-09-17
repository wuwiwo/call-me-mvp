# 验证工具

可复现的浏览器端到端验证，用于复核：

- **CM-002** — 修复已有自定义按钮编辑路径（`e2e.mjs`）
- **CM-003** — LocalStorage JSON 容错与启动可靠性（`storage-resilience.mjs`）
- **CM-004** — 按钮 ID 兼容规则（`button-ids.mjs`）

## 依赖

仅 **Node 内置模块** + 本机 Chrome。**零 npm 依赖**，不污染 `package.json`。

## 跑法

```bash
node tools/e2e.mjs                  # CM-002：29 项断言（自带服务器）
node tools/storage-resilience.mjs   # CM-003：51 项断言（自带服务器）
node tools/negative-storage.mjs     # CM-003：反向验证
node tools/button-ids.mjs           # CM-004：52 项断言（自带服务器）
node tools/negative-button-ids.mjs  # CM-004：反向验证
```

所有脚本都以退出码表达结果：`0` = 通过，非 `0` = 失败。

> **三个脚本都自带静态服务器**（与 Chrome 同进程），不需要另开终端。
> 原因见下文「服务器必须与浏览器同进程」。
> CM-002/CM-003 也支持复用外部服务器：`CM002_NO_SERVER=1` / `CM003_NO_SERVER=1`。

## 文件说明

| 文件 | 用途 |
|---|---|
| `server.mjs` | 零依赖静态服务器，服务仓库根目录（可选，供复用外部服务器时使用） |
| `e2e.mjs` | CM-002：CDP 驱动真实浏览器，29 项断言 |
| `negative.mjs` | CM-002：回退修复 → 重跑 → 自动还原，验证测试有效性 |
| `storage-resilience.mjs` | CM-003：存储容错，51 项断言 |
| `negative-storage.mjs` | CM-003：反向验证（纯文件备份还原） |
| `button-ids.mjs` | CM-004：按钮 ID 兼容规则，52 项断言 |
| `negative-button-ids.mjs` | CM-004：反向验证 |
| `input-safety.mjs` | CM-005：动态用户输入注入防护，64 项断言 |
| `negative-input-safety.mjs` | CM-005：反向验证（从基线 ref 取原文覆盖，非手写回退片段） |
| `ACCEPTANCE.md` | CM-002 / CM-003 / CM-004 / CM-005 的完整验收报告 |

> **日志文件不入库。** `tools/*.log` 被 `.gitignore:20`（`*.log`）忽略 ——
> 它们是**运行时证据**，脚本自身（含全部断言清单）才是可追溯的复核依据。
> 重跑即可复现，用 `CM003_LOG` / `CM004_LOG` / `CM005_LOG` 可指定落盘路径。

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

对齐 CM-005 验收标准，共 **64** 项断言，分 8 个用例：

| 用例 | 覆盖内容 |
|---|---|
| 1 | 首页按钮渲染：恶意 `message`（`<script>` / `<img onerror>`）与恶意 `icon` |
| 2 | 按钮编辑表单：恶意 `message` 经 `value` **完整回显**，不产生额外属性 |
| 3 | 图标选择器：恶意 `icon` 回退为安全值，不进入 class / `dataset.value`；保存后不落库原始载荷 |
| 4 | 自定义按钮表单：结构注入载荷（`</span><b id="inj">`）只作文本 |
| 5 | 历史渲染：恶意 `nickname` / `message` / `emoji` / `webhook` |
| 6 | 历史 `_status`：未知值不产生状态 class；`success` / `error` / 缺失三种情形不回归 |
| 7 | 合法数据不回归：`fire` / `random` / `star` 渲染、文案、`data-button-index`、选择器回显 |
| 8 | 全流程无未捕获异常 / `console.error` |

**判定"注入未发生"的四类独立证据**（每类都单独断言，不靠单一信号）：

1. `window.__pwned` 未被设置 —— 脚本或事件属性**确实没有执行**
2. 容器内不存在 `SCRIPT` / `IMG` / `SVG` / `IFRAME` 等注入元素
3. 容器内不存在任何 `on*` 事件属性
4. 恶意串以**字面文本**出现在 `textContent` 中 —— 证明是被当作文本渲染，
   而不是被过滤掉或当作 HTML 解析

> 第 4 条是刻意设计的：只断言"没有报错/没有 pwned"会把"把内容整个过滤掉"
> 也算成通过，而那会破坏功能。文本必须在，且必须仍是文本。

**反向验证**（`negative-input-safety.mjs`）不同于前几个任务的做法：
它**不手写回退片段**，而是用 `git show <ref>:<file>` 取出**基线分支的原文**覆盖
当前文件 —— 回退的就是真正的缺陷版本，避免"手写回退与真实历史有偏差"造成的假结论。

```text
修复版本退出码 : 0 (预期 0)          断言：64 passed, 0 failed
回退版本退出码 : 1 (预期非 0)        断言：36 passed, 28 failed
回退版本注入类失败项 : 17 条 (预期 > 0)
源码已还原     : true (预期 true)
```

回退版本的关键证据：

```text
FAIL  首页按钮容器：无元素注入（无 SCRIPT/IMG/SVG 等） -> ["IMG","SCRIPT","IMG"]
FAIL  首页按钮容器：无事件属性注入（无 on* 属性）      -> ["IMG@onerror","IMG@onerror"]
FAIL  首页按钮容器：脚本/事件未执行（__pwned 未设置）  -> true     ← 脚本真的执行了
FAIL  表单 value 完整回显恶意 message（未被截断/逃逸） -> ""        ← value 属性被突破
FAIL  首页：恶意 icon 被替换为安全值（非原样拼接）      -> fas fa-bolt
```

`__pwned = true` 是**真实执行**的直接证据（不是"可能被注入"的推断）；
`value -> ""` 则说明 `value="${message}"` 的属性突破路径在修复前是可达的。

> **为什么反向验证还要求"失败项必须是注入类"**：只比较退出码会把
> 端口占用、Chrome 起不来等基础设施抖动误读成"测试有效"。
> 脚本因此额外断言失败项中包含注入类关键字，并要求修复版汇总为 `0 failed`。

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

**CDP 脚本里的临时诊断文件会被 lint 扫到。** 把调试脚本放 `.workbuddy/` 不够 ——
ESLint 会遍历仓库，`no-undef`（`process` 未定义）等会直接让 `lint` exit 1。
**临时脚本用完立刻删**，别留在仓库树里过夜。

**测试用例必须自带隔离。** `tools/*.mjs` 用的 Chrome profile 目录跨运行复用，
若用例只注入部分 key，会继承上一轮残留数据 → 首次全绿、复跑却失败。
`button-ids.mjs` 的 `injectAndLoad` 已改为**先 `localStorage.clear()` 再注入**，
用例之间互不污染、脚本可重复运行。

**反向验证不要用 `git stash`。** 2026-09-17 一次 `git stash` 失败后
`.git/refs/` 与对象库被清空，仓库一度不可用（靠 reflog + `fetch` 才恢复）。
改用纯文件备份/还原，并用 `try/finally` 保证异常时也还原。

**`npm run lint` 在本机不可用（exit 1）。** 不是 ESLint 报错 ——
`node_modules/.bin/eslint` 是 POSIX shim，首行依赖 `dirname` / `sed`，
而本机 bash 的 PATH 被裁剪，shim 直接 `SyntaxError`。
验证 lint 请绕开 shim 调用真实入口：

```bash
node node_modules/eslint/bin/eslint.js .
```

**`node -e "..."` 在本机会被 shell 吃掉引号。** 含引号/正则的复杂内联脚本
（尤其 `-e` 里带 `'` 或 `|`）会被 MSYS 改写后抛 `SyntaxError`。
改为写成独立 `.py` / `.mjs` 文件再执行。
