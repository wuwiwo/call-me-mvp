# Call Me MVP 实际架构

## 总体结构

```text
index.html
  └─ js/main.js (DOMContentLoaded -> CallMeApp)
       ├─ state.js -> LocalStorage / 浏览器语言
       ├─ language.js -> translations.js -> 首页 DOM
       ├─ profile.js -> userProfile -> 首页 DOM
       ├─ buttonManager.js -> 首页按钮 DOM
       │    ├─ notification.js -> MacroDroid webhook
       │    └─ countdown.js -> cooldown DOM / state
       ├─ password.js -> password modal / LocalStorage
       ├─ onboarding.js -> 动态 overlay/modal
       └─ sounds.js -> HTML Audio / sounds/

history.html
  └─ 内联 module script -> history.js
       └─ LocalStorage notificationHistory -> history DOM
```

## 页面与入口

- `index.html` 是主页面，静态声明用户资料模态框、按钮编辑模态框、语言菜单、倒计时和通知区域；按钮本体由 `buttonManager.renderButtons()` 动态生成。
- `js/main.js` 在 `DOMContentLoaded` 创建 `CallMeApp`，依次收集 DOM、初始化模块、恢复冷却、动态添加历史按钮。
- `history.html` 自己导入 `history.js` 并初始化历史列表、返回和清除按钮；没有加载 `main.js` 或 `language.js`。

## 模块职责与实际依赖

| 模块               | 实际职责                                                | 主要副作用                            |
| ------------------ | ------------------------------------------------------- | ------------------------------------- |
| `config.js`        | webhook、JSONBin、冷却、按钮、密码、音效配置            | 无                                    |
| `state.js`         | 资料、语言、点击权限、请求状态；模块导入时立即 `init()` | 读 LocalStorage、创建恢复定时器       |
| `buttonManager.js` | 按钮配置加载/保存、首页渲染、编辑表单、点击入口         | 改 DOM、LocalStorage、调用通知/倒计时 |
| `notification.js`  | toast、历史写入、webhook、回执轮询                      | fetch、LocalStorage、DOM、音效        |
| `countdown.js`     | 倒计时 interval 与显示                                  | 改 state、LocalStorage、DOM           |
| `profile.js`       | 资料模态框与保存                                        | LocalStorage、DOM                     |
| `language.js`      | 首页语言状态和菜单                                      | LocalStorage、DOM                     |
| `history.js`       | 历史页渲染与清除                                        | LocalStorage、DOM                     |
| `password.js`      | 前端密码提示、过期时间                                  | LocalStorage、动态 DOM                |
| `onboarding.js`    | 首次访问引导                                            | LocalStorage、动态 DOM                |
| `sounds.js`        | 音效缓存和播放                                          | Audio 网络/播放                       |
| `utils.js`         | 翻译、字符串、时间工具                                  | 读取 state/translations               |

## 状态管理与持久化

没有单一 store。运行时状态在 `state`、`buttonManager`、`countdown`、`password`、`onboarding` 等对象中分散维护；持久化直接由多个模块读写 LocalStorage。

详细 key 与读写链路见 [DATA_FLOW.md](DATA_FLOW.md)。当前没有 schema version、迁移机制或统一损坏数据策略。

## 网络模型

1. webhook：`notification.sendNotification()` 将 message、nickname、emoji、msgId 拼入 GET query string。
2. 回执：成功后 `pollReadStatus()` 每 2 秒 GET JSONBin 公开 endpoint，匹配 `msgId` 与 `status === "read"`，最多 15 次。轮询句柄化、可取消：新发送先取消旧轮询（CM-008）。
3. 音频/CDN：Font Awesome、Google Fonts 和音效资源也依赖网络/静态资源路径。

## 关键架构观察

- `state.canClick` 是点击闸门，但点击时间由 `buttonManager` 和 `notification` 都写入；冷却恢复又由 `state.init`、`main.checkCooldown`、`countdown` 分别参与。
- 按钮数据同时表示默认按钮和自定义按钮，默认按钮身份在保存时改为按位置生成的 `default_1` 等；自定义 ID 每次保存用时间生成。
- 历史记录、按钮配置、资料等使用无版本 JSON，任何一个损坏值都可能造成解析异常。
- “密码模块先初始化”只是模态框显示顺序，不形成后端授权或真正的访问控制层。
