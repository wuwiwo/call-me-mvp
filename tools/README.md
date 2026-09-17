# CM-002 验证工具

可复现的浏览器端到端验证，用于复核 CM-002（修复已有自定义按钮编辑路径）。

## 依赖

仅 **Node 内置模块** + 本机 Chrome。**零 npm 依赖**，不污染 `package.json`。

## 跑法

```bash
# 终端 1：起静态服务器（仓库根目录，默认端口 8899）
node tools/server.mjs

# 终端 2：跑端到端断言（自动启停无头 Chrome）
node tools/e2e.mjs

# 终端 3（可选）：反向验证 —— 证明测试确实能捕获该缺陷
node tools/negative.mjs
```

两个脚本都以退出码表达结果：`0` = 通过，非 `0` = 失败。

## 文件说明

| 文件 | 用途 |
|---|---|
| `server.mjs` | 零依赖静态服务器，服务仓库根目录 |
| `e2e.mjs` | CDP 驱动真实浏览器，29 项断言 |
| `negative.mjs` | 回退修复 → 重跑 → 自动还原，验证测试有效性 |
| `RUN_e2e.log` | E2E 实跑输出（浏览器版本 / URL / 逐项结果） |
| `RUN_negative.log` | 反向验证实跑输出 |
| `ACCEPTANCE.md` | CM-002 完整验收报告 |

## 可配置项（环境变量）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CM002_BASE` | `http://127.0.0.1:8899` | 测试站点地址 |
| `CM002_CDP_PORT` | `9444` | Chrome 调试端口 |
| `CM002_CHROME` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Chrome 可执行文件路径 |

例（换机器时）：

```bash
CM002_CHROME="/usr/bin/google-chrome" node tools/e2e.mjs
```

## 覆盖的验收路径

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

## 环境注意事项

**代理会劫持回环请求。** 若本机设置了 `HTTP_PROXY` / `HTTPS_PROXY`，
探测本地端口会返回 `HTTP 502` 而非连接拒绝，导致 Chrome 无法监听调试端口。
本脚本已内置处理：

- Chrome 启动参数加 `--no-proxy-server --proxy-bypass-list=<-loopback>`
- spawn 前清空环境变量中所有匹配 `/proxy/i` 的键
- 探针使用 `node:http` 直连（**不能用 `fetch`**，它会被代理接管）

**Chrome 生命周期。** 脚本在自身进程内启动 Chrome、跑完断言后 `kill()`。
不要改成 `detached` 外部启动——子进程会随 shell 会话结束被回收，下条命令里端口就没了。

**`buttonManager.js` 是 CRLF 行尾。** `negative.mjs` 做文本替换时按行数组操作，
不依赖行尾符，改动该逻辑时请保持这一约束。
