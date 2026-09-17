# 验证工具

可复现的浏览器端到端验证，用于复核：

- **CM-002** — 修复已有自定义按钮编辑路径（`e2e.mjs`）
- **CM-003** — LocalStorage JSON 容错与启动可靠性（`storage-resilience.mjs`）

## 依赖

仅 **Node 内置模块** + 本机 Chrome。**零 npm 依赖**，不污染 `package.json`。

## 跑法

```bash
# CM-002：需要先手动起静态服务器
node tools/server.mjs          # 终端 1（常驻）
node tools/e2e.mjs             # 终端 2
node tools/negative.mjs        # 终端 3（可选）反向验证

# CM-003：自带静态服务器，单条命令即可
node tools/storage-resilience.mjs
node tools/negative-storage.mjs
```

所有脚本都以退出码表达结果：`0` = 通过，非 `0` = 失败。

> **注意**：CM-003 的两个脚本**自带静态服务器**（与 Chrome 同进程），
> 因此不需要另开终端。原因见下文「服务器必须与浏览器同进程」。

## 文件说明

| 文件 | 用途 |
|---|---|
| `server.mjs` | 零依赖静态服务器，服务仓库根目录（CM-002 用） |
| `e2e.mjs` | CM-002：CDP 驱动真实浏览器，29 项断言 |
| `negative.mjs` | CM-002：回退修复 → 重跑 → 自动还原，验证测试有效性 |
| `storage-resilience.mjs` | CM-003：存储容错，29 项断言（自带服务器） |
| `negative-storage.mjs` | CM-003：反向验证（自带服务器，纯文件备份还原） |
| `ACCEPTANCE.md` | CM-002 与 CM-003 的完整验收报告 |

> **日志文件不入库。** `tools/*.log` 被 `.gitignore:20`（`*.log`）忽略 ——
> 它们是**运行时证据**，脚本自身（含全部断言清单）才是可追溯的复核依据。
> 重跑即可复现，用 `CM003_LOG` 可指定落盘路径。

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

对齐 CM-003 验收标准，对三个 key 分别注入非法 JSON 与错误顶层类型：

1. `userProfile` 非法 JSON → 首页可加载、回退未注册、无未捕获异常
2. `userProfile` 错误类型（数组 / 字符串 / 数字）
3. `notificationHistory` 非法 JSON → 历史页可加载并显示空状态
4. `notificationHistory` 错误类型（对象 / 数字 / 字符串）
5. `buttonConfig` 非法 JSON → 回退 `CONFIG.buttons.defaultButtons`
6. `buttonConfig` 错误类型（数组 / 字符串 / 数字）
7. `buttonConfig` 合法但 `buttons` 非数组 → 回退默认
8. 合法旧数据不回归（按钮配置 / 历史记录 / 用户昵称）

## 环境注意事项

**代理会劫持回环请求。** 若本机设置了 `HTTP_PROXY` / `HTTPS_PROXY`，
探测本地端口会返回 `HTTP 502` 而非连接拒绝，导致 Chrome 无法监听调试端口。
所有脚本已内置处理：

- Chrome 启动参数加 `--no-proxy-server --proxy-bypass-list=<-loopback>`
- spawn 前清空环境变量中所有匹配 `/proxy/i` 的键
- 探针使用 `node:http` 直连（**不能用 `fetch`**，它会被代理接管）

**Chrome 生命周期。** 脚本在自身进程内启动 Chrome、跑完断言后 `kill()`。
不要改成 `detached` 外部启动——子进程会随 shell 会话结束被回收，下条命令里端口就没了。

**服务器必须与浏览器同进程（CM-003 的教训）。** 单独一条命令后台起
`server.mjs`，下一条命令里端口就没了（子进程被回收）。CM-003 脚本因此
把静态服务器内联在同进程启动，避免这个陷阱。

**CDP 下必须先导航到同源页面再写 localStorage。** 在 `about:blank`
上执行 `localStorage.setItem` 会抛 `SecurityError`。若导航失败（如服务器没起），
页面会停在 `chrome-error://chromewebdata/`，症状同样是 `SecurityError` ——
**别把「服务器没起」误判成「localStorage 不可用」**。

**`.js` 文件是 CRLF 行尾。** 做文本替换时必须先 `\r\n → \n` 归一化再匹配，
写回时还原为 `\r\n`；不要用含 `\n` 的固定字符串直接匹配。
CM-003 的 `negative-storage.mjs` 已内置 `readNorm` / `writeCRLF`。

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
