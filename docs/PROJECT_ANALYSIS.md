# Call Me MVP 项目分析

## 审计范围

- 任务：CM-001 Full Repository Audit
- 审计日期：2026-09-17
- 审计方式：阅读仓库源码、页面、样式、配置、现有文档与 Git 历史；运行现有 lint/format 检查。
- 约束：本阶段只新增审计文档，不修改业务代码、不重构、不新增功能。

## 项目是什么

Call Me MVP 是一个纯前端、静态部署的通知推送工具。用户绑定昵称与 Emoji 后，点击首页通知按钮，通过 Fetch GET 请求向 MacroDroid webhook 发送消息；发送结果写入浏览器 LocalStorage，并可在历史页查看。最近版本还增加了 JSONBin 轮询形式的已读回执、密码访问提示与新手引导。

### 当前技术栈与部署

- 原生 JavaScript ES Modules，无前端框架。
- HTML/CSS；Font Awesome CDN 与 Google Fonts CDN。
- Fetch API 调用 MacroDroid webhook；JSONBin 公开读取接口用于已读回执。
- LocalStorage 保存资料、按钮、语言、冷却时间、历史和密码状态。
- GitHub Pages 静态部署；`package.json` 仅提供 ESLint/Prettier 工具链，没有构建脚本。

## 当前功能完成度

| 功能 | 状态 | 源码事实 |
| --- | --- | --- |
| 首页通知按钮 | 部分完成 | `buttonManager` 动态渲染按钮并调用 `notification.sendNotification`。成功/失败链路存在，但状态由多个模块共同维护。 |
| MacroDroid webhook | 已完成（依赖外部服务） | `notification.js:85-112` 以 GET + query string 发起请求，并检查 `response.ok`。 |
| 冷却倒计时 | 部分完成 | `state`、`main`、`buttonManager`、`countdown` 都参与冷却状态；存在重复写入和重复定时器风险。 |
| 用户资料 | 已完成 | `profile.js` 保存昵称和 Emoji 到 `userProfile`。输入来自用户并直接进入动态 HTML 的风险见技术债。 |
| 按钮编辑/自定义 | 存在问题 | 自定义已有按钮编辑路径访问不存在的 `.icon-selector`；默认 ID 也会被重写。 |
| 多语言 | 部分完成 | 首页语言切换已实现；历史页只初始化 `history`，没有初始化 `language`。 |
| 历史记录 | 部分完成 | 首页写入、历史页读取/清除存在；JSON 损坏未处理，清除反馈硬编码中文。 |
| 音效 | 部分完成 | 预加载与播放存在；配置没有 `notifications.error`，失败反馈会尝试播放 undefined URL。 |
| 已读回执 | 部分完成 | 成功后轮询公开 JSONBin，最多约 30 秒；没有取消旧轮询或按通知维持独立 UI 状态。 |
| 新手引导 | 部分完成 | 首页首次访问延迟显示 8 步引导；跳过不会记录完成状态，且语言切换不会刷新已显示引导文本。 |
| 密码访问控制 | 部分完成/弱控制 | 密码和自定义密码均在前端与 LocalStorage；密码模态框覆盖 UI，但不是服务端授权边界。 |

## 运行与验证基线

- Git：`main` 与 `origin/main` 同步，无未提交改动；近期提交按功能拆分，但提交前后存在多次修复同一模块的历史。
- `npm run lint`：通过。
- `npm run format:check`：失败，报告 29 个文件存在格式问题。
- 自动化测试：`package.json` 仍没有 test 脚本，也没有 CI；本次新增了 CM-002 专用的 `.cm002_tools/` 零依赖 CDP E2E 工具和运行日志，已独立复跑 29/29 通过，但尚未形成通用测试入口。
- CI/CD：仓库未发现 GitHub Actions；README 描述 GitHub Pages 手工分支部署。
- 构建：无构建步骤，静态文件直接服务。
- 浏览器验证：CM-002 已在 Chrome 152/headless 环境独立复跑 29/29 通过，并完成缺陷版本反向验证；其他功能和移动端表现仍未全面验证。

## 真实风险摘要

最高优先级是修复已有自定义按钮编辑崩溃、增加 LocalStorage 容错、统一按钮身份模型，并在决定是否保留密码功能前明确其威胁模型。密码模块不能被描述为真正的 Secret Protection；webhook URL 也在前端配置中公开，这是纯前端架构的已知边界。

## 已验证与待验证

### 通过源码/config/Git 验证

- 上述模块依赖、LocalStorage key、网络 URL、冷却参数、按钮数量与 ID 生成方式。
- 自定义按钮编辑的 `.icon-selector` 空访问路径。
- 历史页没有导入/初始化 `language`。
- JSON 解析、动态 HTML 插值、重复状态维护的位置。
- lint 通过、format check 失败、无自动化测试脚本、无 CI 文件。

### 尚未证明

- 真实浏览器中每个 UI 分支的最终表现、移动端布局和 CDN 可用性。
- MacroDroid 与 JSONBin 当前线上响应格式及 CORS 行为。
- 用户是否把密码功能视为安全边界；这需要产品/威胁模型决策。
