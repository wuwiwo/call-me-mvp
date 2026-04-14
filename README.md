# 📱 Call Me MVP

一个基于 Notion 风格设计的通知推送工具，支持多语言、自定义按钮配置和音效反馈。

**🌐 在线预览：** https://wuwiwo.github.io/call-me-mvp/

---

## ✨ 功能特性

### 🎯 核心功能
- **智能通知按钮** - 点击即可发送 webhook 通知到指定设备
- **冷却倒计时** - 60 秒冷却机制，防止频繁触发
- **多语言支持** - 中文、English、日本語、한국어 一键切换
- **用户资料系统** - 自定义昵称和 Emoji 头像
- **音效反馈** - 不同头像对应独特音效，操作更有感
- **历史记录** - 完整记录所有通知发送历史

### 🎨 界面设计
- **Notion 风格** - 简洁优雅的 UI 设计
- **动态标题** - 霓虹渐变色动画效果
- **流畅过渡** - 所有交互都有丝滑动画
- **响应式布局** - 完美适配桌面和移动端
- **触摸优化** - 移除点击高亮，移动端体验更佳

### ⚙️ 自定义配置
- **按钮编辑** - 修改按钮文字和图标
- **自定义按钮** - 添加专属功能按钮（最多 1 个）
- **头像选择** - 10 种可爱 Emoji 可选
- **图标库** - 8 种 Font Awesome 图标可配置

---

## 📸 功能截图

> 访问 [在线演示](https://wuwiwo.github.io/call-me-mvp/) 体验完整功能

---

## 🏗️ 项目结构

```
call-me-mvp/
├── index.html              # 主页面
├── index.css               # 主样式（Notion 风格）
├── history.html            # 历史记录页面
├── history.css             # 历史页面样式
├── js/
│   ├── main.js             # 应用入口和主类
│   └── modules/
│       ├── config.js       # 全局配置（webhook、冷却时间等）
│       ├── state.js        # 状态管理（用户资料、语言等）
│       ├── buttonManager.js # 按钮管理和配置
│       ├── profile.js      # 用户资料管理
│       ├── language.js     # 多语言切换
│       ├── notification.js # 通知发送和显示
│       ├── countdown.js    # 倒计时逻辑
│       ├── history.js      # 历史记录管理
│       ├── sounds.js       # 音效播放控制
│       ├── utils.js        # 工具函数
│       └── translations.js # 多语言翻译数据
└── sounds/                 # 音效资源
    ├── dog-bark.mp3        # 狗叫声（🐶头像）
    ├── cat-meow.mp3        # 猫叫声（🐱头像）
    ├── tiger-roar.wav      # 虎啸声（🐯头像）
    ├── lion-roaring.mp3    # 狮吼声（🦁头像）
    ├── monkey-sound.wav    # 猴叫声（🐵头像）
    └── ...
```

---

## 🚀 快速开始

### 本地运行

1. **克隆项目**
   ```bash
   git clone https://github.com/wuwiwo/call-me-mvp.git
   cd call-me-mvp
   ```

2. **启动服务**
   
   使用任意静态服务器，例如：
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js (需要先安装 npx)
   npx serve
   
   # PHP
   php -S localhost:8000
   ```

3. **访问页面**
   
   打开浏览器访问 `http://localhost:8000`

### 部署到 GitHub Pages

项目已配置为直接部署到 GitHub Pages：

1. 将代码推送到 GitHub 仓库
2. 在仓库 Settings → Pages 中选择分支
3. 访问 `https://<username>.github.io/call-me-mvp/`

---

## ⚙️ 配置说明

### 修改 Webhook 地址

编辑 `js/modules/config.js` 文件：

```javascript
export const CONFIG = {
    webhookUrl: "YOUR_WEBHOOK_URL_HERE",  // 修改为你的 webhook 地址
    cooldownTime: 60,                      // 冷却时间（秒）
    maxHistoryRecords: 100,                // 最大历史记录数
    // ... 其他配置
};
```

### 自定义默认按钮

在 `config.js` 中修改：

```javascript
buttons: {
    defaultButtons: [
        {
            id: "quick_online",
            message: "你的按钮文字",
            icon: "bolt"  // Font Awesome 图标名
        },
        // ... 更多按钮
    ],
    availableIcons: [
        "bolt", "bell", "fire", "shield-alt", // ... 可选图标
    ]
}
```

### 添加新语言

在 `js/modules/translations.js` 中添加翻译：

```javascript
export const TRANSLATIONS = {
    fr: {  // 法语
        title: "APPELEZ MOI",
        subtitle: "Cliquez pour notifier",
        // ... 其他翻译
    }
}
```

---

## 🎯 使用指南

### 首次使用

1. 打开页面后会弹出"绑定账号"窗口
2. 输入昵称（最多 12 个字符）
3. 选择喜欢的 Emoji 头像
4. 点击"保存信息"

### 发送通知

1. 点击任意气泡按钮
2. 系统会发送 webhook 通知
3. 进入 60 秒冷却倒计时
4. 倒计时结束后可再次点击

### 编辑按钮

1. 点击顶部工具栏的滑块图标（⚙️）
2. 修改按钮文字（15 字以内）
3. 选择图标或设为随机
4. 可添加自定义按钮
5. 点击"保存设置"

### 切换语言

1. 点击顶部语言下拉菜单
2. 选择目标语言
3. 界面即时切换

### 查看历史

1. 点击顶部历史图标（📜）
2. 查看所有通知记录
3. 可点击垃圾桶清除全部历史

---

## 🛠️ 技术栈

- **前端框架**: 纯原生 JavaScript (ES6+)
- **模块化**: ES Modules
- **样式**: CSS3 + CSS Variables
- **图标**: Font Awesome 6.4.0
- **字体**: Google Fonts (Montserrat)
- **存储**: LocalStorage
- **通信**: Fetch API (Webhook)
- **音频**: HTML5 Audio API

---

## 📦 核心模块说明

| 模块              | 功能       | 关键方法                                   |
| ----------------- | ---------- | ------------------------------------------ |
| **CallMeApp**     | 应用主入口 | `initElements()`, `initModules()`          |
| **buttonManager** | 按钮管理   | `renderButtons()`, `handleButtonClick()`   |
| **notification**  | 通知系统   | `sendNotification()`, `show()`             |
| **countdown**     | 倒计时     | `start()`, `stop()`                        |
| **profile**       | 用户资料   | `save()`, `loadProfile()`                  |
| **language**      | 多语言     | `switchLanguage()`, `getCurrentLanguage()` |
| **soundManager**  | 音效       | `playAvatarSound()`, `preload()`           |
| **history**       | 历史记录   | `addRecord()`, `clearHistory()`            |
| **state**         | 状态管理   | `init()`, `checkCooldownStatus()`          |

---

## 💾 数据存储

项目使用 LocalStorage 存储以下数据：

| 键名                  | 类型   | 说明                   |
| --------------------- | ------ | ---------------------- |
| `userProfile`         | Object | 用户资料（昵称、头像） |
| `buttonConfig`        | Object | 按钮配置               |
| `appLanguage`         | String | 当前语言               |
| `lastClickTime`       | Number | 上次点击时间戳         |
| `notificationHistory` | Array  | 通知历史记录           |

---

## 🎨 UI 设计规范

### 配色方案

```css
--primary: #37352f        /* 主文字色 */
--secondary: #f1f1ef      /* 背景色 */
--accent: #337ea9         /* 强调色（蓝） */
--notion-blue: #337ea9    /* Notion 蓝 */
--notion-orange: #e9a15a  /* Notion 橙 */
--notion-gray: #f7f6f3    /* Notion 灰 */
```

### 阴影层级

```css
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.06)   /* 轻阴影 */
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08)  /* 中阴影 */
```

---

## 🐛 常见问题

### Q: 点击按钮没反应？
A: 检查浏览器控制台是否有错误，确认已绑定用户资料。

### Q: 如何修改冷却时间？
A: 编辑 `js/modules/config.js` 中的 `cooldownTime` 值。

### Q: 音效不播放？
A: 确保浏览器允许自动播放音频，或检查音频文件路径。

### Q: 如何清除冷却状态？
A: 打开浏览器控制台执行：`localStorage.removeItem('lastClickTime')`，然后刷新页面。


---


## 📮 联系方式

- 项目地址：https://github.com/wuwiwo/call-me-mvp
- 在线演示：https://wuwiwo.github.io/call-me-mvp/

---

**⭐ 如果这个项目对你有帮助，请给个 Star！**
