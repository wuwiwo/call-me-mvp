# Call Me MVP 核心数据流

## 启动流程

```text
DOMContentLoaded
  -> new CallMeApp()
  -> initElements()
  -> initModules()
       -> soundManager.preload()
       -> password.init() [过期/无时间则插入模态框]
       -> language.init() [读取 appLanguage，更新首页]
       -> profile.init() [无 userProfile 则打开绑定模态框]
       -> notification.init()
       -> countdown.init()
       -> buttonManager.init()
            -> 读 buttonConfig / 默认配置
            -> 读 buttonDisplayMode
            -> 绑定事件、渲染首页按钮
       -> onboarding.init() [无 onboardingCompleted，1 秒后显示]
  -> checkCooldown() [读取 lastClickTime，启动倒计时]
  -> addHistoryButton() [动态插入 history.html 链接]
```

注意：`state.init()` 在 `state.js` 模块导入时就执行，早于 `CallMeApp` 的 try/catch；损坏的 `userProfile` JSON 可能直接阻止主模块加载。

## 用户配置流程

```text
点击 editProfile
  -> profile.showModal(false)
  -> 选择 emoji / 输入 nickname
  -> profile.save()
  -> state.userProfile = { nickname, emoji }
  -> localStorage.userProfile = JSON.stringify(...)
  -> profile.loadProfile() 更新首页
```

## 通知按钮流程

```text
点击动态 .bubble-btn
  -> buttonManager.handleButtonClick(button)
  -> 检查 state.canClick
  -> 写 lastClickTime，state.canClick=false
  -> countdown.start()
  -> notification.sendNotification(buttonData)
       -> 检查 userProfile
       -> GET webhookUrl?message&nickname&emoji&msgId
       -> 成功：toast、写 notificationHistory、显示 sent、开始回执轮询
       -> 失败：错误 toast、写 error 历史
  -> then(success)
       -> 失败时 stop countdown、恢复 canClick、删除 lastClickTime
```

`notification.sendNotification()` 内部还会再次写 `lastClickTime` 并设置 `isRequestPending`；目前没有使用 `isRequestPending` 作为独立的并发闸门。

## Webhook 与已读回执

- webhook 是 GET，参数经 `URLSearchParams` 编码；HTTP 非 2xx 被视为失败。
- 成功后每 2 秒读取 JSONBin；读取到同一 `msgId` 且 `status=read` 就更新回执，否则约 30 秒后 timeout。
- 轮询已句柄化、可取消（CM-008）：新一次发送会先 `stopReceiptPolling()` 使旧轮询失效（代际守卫），同一时刻活跃轮询 ≤ 1；`#receiptStatus` 只反映最新一次发送的回执。

## Cooldown 流程

```text
点击 -> lastClickTime=now -> countdown.start(60)
每秒 -> remainingTime-- -> 更新 countdown DOM
归零 -> state.canClick=true -> 删除 lastClickTime
刷新 -> state.init/checkCooldownStatus + main.checkCooldown 恢复状态
```

源码事实：`state.js`、`main.js`、`buttonManager.js`、`notification.js` 都参与状态或时间戳操作。网络失败时点击链路会删除时间戳并立即恢复；成功时倒计时继续。

## 历史记录流程

```text
webhook 成功/失败
  -> notification.addHistoryRecord()
  -> 读 notificationHistory JSON
  -> unshift record
  -> 截断 CONFIG.maxHistoryRecords (100)
  -> 写回 LocalStorage

进入 history.html
  -> history.init()
  -> 读 notificationHistory JSON
  -> map 成 HTML
点击清除
  -> removeItem(notificationHistory)
  -> render empty state
```

历史页没有加载语言模块，因此保存的 `appLanguage` 不会在该页面初始化到 `state.currentLang`。

## 语言切换流程

```text
点击 languageToggle -> 展开菜单
点击 .language-option -> language.update(lang)
  -> state.currentLang=lang
  -> localStorage.appLanguage=lang
  -> 更新首页标题、副标题、当前语言、用户名
```

动态 onboarding 已显示时，`language.update()` 不会调用 onboarding 的重新渲染，因此其当前文案不会即时切换。

## 密码 / Access Gate 流程

```text
password.init()
  -> 读 passwordSetTime
  -> 无时间或超过 7 天 -> 动态插入密码 modal
输入 -> verify()
  -> 比较 localStorage.accessPassword 或 CONFIG.password.defaultPassword
  -> 成功：写 passwordSetTime，移除 modal
```

密码 modal 没有服务端验证；`accessPassword` 与默认密码逻辑均可由用户查看/修改。它只能作为个人工具的 UI 级阻挡，不能保护 webhook 或数据资源。

