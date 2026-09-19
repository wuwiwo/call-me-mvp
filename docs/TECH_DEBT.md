# Call Me MVP 技术债与已确认问题

优先级含义：P0 阻断核心使用/数据可靠性；P1 高频功能或明显可靠性问题；P2 维护性/边界问题；P3 非关键清理。

## P1

### CM-001-TD-01：已有自定义按钮编辑会访问不存在的元素

- 类型：Bug / UX
- 问题：`buttonManager.addCustomButtonForm()` 在已有按钮 icon 不是 random 时访问 `form.querySelector(".icon-selector").value`；实际生成的是 `.icon-picker`，因此结果可能是 null.value 异常。
- 证据：`js/modules/buttonManager.js:471-478` 与 `:384-418`。
- 影响：打开包含已有自定义按钮的编辑窗口可能中断渲染，用户无法正常编辑/保存。
- 复现：保存一个带非 random 图标的自定义按钮，再次打开按钮编辑窗口。
- 建议：统一读取/设置 `.icon-picker` 的 `data-value`，补充该路径的 DOM 测试。
- 风险：修复需兼容已有 `buttonConfig` 数据。

### CM-001-TD-02：LocalStorage JSON 损坏可阻断启动或历史页

- 类型：Bug / Reliability
- 问题：`state.init()`、`history.render()` 和 `buttonManager.loadButtonConfig()` 对 JSON 的容错不一致；`state.init()` 与 `history.render()` 直接 JSON.parse。
- 证据：`state.js:12-15`、`history.js:32`、`buttonManager.js:63-82`。
- 影响：用户手工修改、浏览器扩展或部分写入造成损坏后，首页可能在模块导入阶段失败，历史页也可能无法渲染。
- 复现：将 `userProfile` 或 `notificationHistory` 设置为非法 JSON 后刷新。
- 建议：先为每个 key 定义最小 schema/回退策略，再以小任务加入解析测试；不要直接引入大型 Storage Layer。
- 风险：清理损坏数据可能丢失用户本地数据，应提供可观察的回退行为。

### CM-001-TD-03：按钮身份模型不稳定

- 类型：Bug / Architecture
- 问题：保存默认按钮时生成 `default_1`、`default_2`，没有沿用 `CONFIG.buttons.defaultButtons` 的稳定 ID；自定义按钮每次保存都用 `custom_${Date.now()}`。
- 证据：`buttonManager.js:494-519`；默认配置 ID 在 `config.js:54-64`。
- 影响：未来排序、编辑、迁移、统计或跨版本兼容无法可靠依赖 ID；同一自定义按钮保存后身份变化。
- 复现：修改默认按钮或保存已有配置，查看 `localStorage.buttonConfig`。
- 建议：先制定兼容旧配置的 ID 规则，再单独执行按钮模型任务。
- 风险：直接改变 ID 会影响现有本地配置和未来迁移。

### CM-001-TD-04：用户输入通过 innerHTML 写入 DOM

- 类型：Security / Bug
- 问题：昵称、按钮 message、历史 nickname/message 等用户可控值被插入模板字符串 HTML，没有统一转义。
- 证据：`buttonManager.js:266-271, 429-442, 456-473`；`history.js:43-57`。
- 影响：在同一来源下可造成持久化 HTML/脚本注入；个人工具威胁模型可能降低暴露面，但不是安全上可忽略的实现。
- 复现：昵称或按钮文字输入 HTML 标记，保存后重新打开/进入历史页。
- 建议：优先改为 textContent/属性赋值，或使用经过审查的转义函数；补充 XSS 回归测试。
- 风险：模板结构改动可能影响现有样式与图标选择器。

## P2

### CM-001-TD-05：冷却状态由多个模块重复维护

- 类型：Architecture / Reliability
- 问题：`state.init/checkCooldownStatus`、`main.checkCooldown`、`buttonManager.handleButtonClick`、`notification.sendNotification`、`countdown.start` 都读写相关状态或 timer。
- 证据：对应文件中的 `lastClickTime`、`state.canClick`、`setTimeout/setInterval` 调用。
- 影响：未来调整冷却规则时容易产生 UI、LocalStorage 与运行时状态不一致；当前存在重复写 timestamp/恢复 timer。
- 复现：刷新、快速点击、网络失败和倒计时归零交叉测试。
- 建议：以现有行为为基线，先写状态转换测试，再合并单一责任；不要无测试直接大重构。
- 风险：改变失败后的冷却语义会改变用户行为。

### CM-001-TD-06：历史页没有语言初始化，清除反馈硬编码中文

- 类型：Bug / UX
- 问题：`history.html` 只导入 `history.js`；`history.js:66-69` 的 toast 固定为中文。
- 影响：用户在首页选择英文/日文/韩文后，历史页标题和清除提示仍可能是中文。
- 证据：`history.html:38-47`、`history.js:66-74`。
- 建议：先确定历史页是否需要完整语言体验，再补最小初始化/文案测试。
- 风险：历史页引入语言模块需处理页面 DOM 缺失项。

### CM-001-TD-07：已读回执共享单一 UI 且轮询不可取消（已解决，CM-008）

- 类型：Architecture / UX / Performance
- 问题（历史）：所有轮询更新同一 `#receiptStatus`，timer 不保存在状态中，也没有新请求取消旧请求。
- 影响：多个通知或页面生命周期异常时，旧响应可能覆盖新回执；后台继续产生请求直到各自超时。
- 证据：`notification.js:147-175`。
- 建议：在明确产品是否允许并发通知后，建立 request/receipt 状态关联，再改轮询。
- 风险：改变回执文案和超时行为。

### CM-001-TD-08：配置与实现存在重复/未使用定义

- 类型：Maintainability / DX
- 问题：`CONFIG.password` 定义了默认密码和过期天数，但 `password.js` 又硬编码相同值；`soundManager.playNotificationSound(false)` 访问未配置的 `notifications.error`。
- 影响：修改配置可能不会改变实际行为；错误音效路径不明确。
- 证据：`config.js:23-32,45-48`、`password.js:7,11`、`sounds.js:49-53`。
- 建议：小范围统一单一来源，并明确失败音效是否为产品需求。
- 风险：配置变更可能影响现有部署行为。

## P3

### CM-001-TD-09：格式化基线未达标（已解决，2026-09-20）

- 类型：DX / Maintainability
- 问题（历史）：`npm run format:check` 报告 29 个文件格式不符合 Prettier；`npm run lint` 通过。
- 证据：2026-09-17 本地命令结果（29 文件）；2026-09-20 复测 74 文件（含后续新增）。
- 解决：2026-09-20 主 AI 执行 prettier --write，格式化 56 个非归档文件（js/mjs/html/css/json/md）。归档文件（`docs/handoff/archive/`）保持原样（历史快照不格式化）。`package-lock.json` 跳过。新增 `.prettierignore` 排除归档/本地/锁文件。验证：lint 0 + prettier --check 0 + run-all 10/10（537 项断言 0 失败）。
- 提交：`14ad5ea`（`style: prettier 全量格式化`）。

### CM-001-TD-10：测试入口与 CI 缺口

- 类型：Testing / DX
- 问题：无通用 test 脚本、无 GitHub Actions；当前只有 CM-002 专用的 `.cm002_tools/` CDP E2E 工具，`TESTING.md` 仍主要是手工清单。
- 影响：LocalStorage 损坏、冷却与回执等高风险路径没有自动回归保障；已有 CM-002 验证尚未成为通用门禁。
- 证据：`package.json` scripts 没有 test；仓库文件无 `.github/workflows`；`.cm002_tools/e2e.mjs` 依赖本机 Chrome 和单独静态服务器。
- 建议：保留 CM-002 可复跑工具，先补纯函数/存储解析测试，再提供稳定测试入口并评估浏览器 E2E/CI；不要把会改写源码的反向验证直接放进 CI。
- 风险：引入测试运行器会增加依赖和维护成本。

## 安全边界记录

- 已确认：密码默认值、用户自定义密码和 webhook URL 在前端可见；这不是 Secret Protection。
- 未判定：对于个人工具威胁模型是否足以接受。需要 Human 决定是否保留该功能及其文案，不能把前端密码模块升级描述为真实访问控制。
