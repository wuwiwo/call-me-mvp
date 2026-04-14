# 🎉 Call Me 新功能说明

## 本次更新内容

### 1. 🎓 新手引导功能 (Onboarding)

**功能简介：**
为首次访问的用户提供交互式教程，帮助用户快速了解和使用应用的各项功能。

**主要特性：**
- ✨ **自动触发** - 首次访问时自动显示
- 📝 **8 步完整引导** - 涵盖所有核心功能
- 🎯 **元素高亮** - 引导步骤中自动高亮相关界面元素
- 🌍 **多语言支持** - 支持中文、英文、日文、韩文
- ⏭️ **可跳过** - 用户可以随时跳过引导
- 💾 **状态记录** - 完成后不再重复显示

**引导步骤：**
1. 👋 欢迎介绍
2. 📝 设置用户资料指引
3. 🎯 通知按钮使用说明
4. ⚙️ 自定义按钮功能
5. 🌍 多语言切换方法
6. 📜 历史记录查看
7. ⏱️ 冷却时间说明
8. 🎉 准备就绪

**如何重新显示引导：**
```javascript
// 方法 1: 浏览器控制台执行
localStorage.removeItem('onboardingCompleted');
location.reload();

// 方法 2: 使用模块方法
onboarding.reset();
```

---

### 2. 🔐 密码验证功能 (Password Protection)

**功能简介：**
提供简单的访问控制功能，通过密码验证才能使用应用，密码每周自动过期。

**主要特性：**
- 🔒 **访问控制** - 输入正确密码才能使用应用
- ⏰ **自动过期** - 密码 7 天后自动失效
- ⌨️ **便捷输入** - 支持回车键快速验证
- 🚫 **强制验证** - 不能通过点击外部跳过
- 💡 **友好提示** - 错误提示清晰友好
- 🔧 **易于修改** - 可通过代码或控制台修改密码

**默认密码：**
```
123456
```

**使用方法：**
1. 打开页面后显示密码输入框
2. 输入密码（默认：123456）
3. 点击"验证"按钮或按回车键
4. 验证通过后正常使用应用

**密码管理：**

```javascript
// 查看密码过期剩余天数
password.getRemainingDays();

// 设置新密码
password.setPassword('your_new_password');

// 清除密码设置（恢复默认）
password.clearPassword();

// 手动检查是否过期
password.isPasswordExpired();
```

**修改默认密码：**

方法 1：直接修改代码
```javascript
// 文件：js/modules/password.js
export const password = {
    correctPassword: 'YOUR_NEW_PASSWORD', // 修改这里
    // ...
};
```

方法 2：浏览器控制台
```javascript
password.setPassword('new_password');
```

**修改过期时间：**
```javascript
// 文件：js/modules/password.js
const PASSWORD_EXPIRY_DAYS = 7; // 修改这个值（单位：天）
```

---

## 📁 新增文件清单

### 模块文件
- `js/modules/onboarding.js` - 新手引导模块
- `js/modules/password.js` - 密码验证模块

### 文档文件
- `TESTING.md` - 详细测试指南
- `NEW_FEATURES.md` - 本文件

### 修改文件
- `js/main.js` - 集成新模块
- `js/modules/config.js` - 添加配置项
- `js/modules/translations.js` - 添加多语言翻译
- `index.css` - 添加新样式
- `README.md` - 更新文档说明

---

## 🎨 UI 展示

### 新手引导界面
- 居中模态框，圆角设计
- 半透明遮罩层，带模糊效果
- 脉冲动画高亮目标元素
- 底部进度指示点
- 双按钮操作（跳过/下一步）

### 密码验证界面
- 与现有模态框风格一致
- 密码输入框自动聚焦
- 错误提示（红色，3秒自动消失）
- 提示信息（蓝色背景）
- Notion 风格设计

---

## 🔧 配置选项

### 新手引导配置
位置：`js/modules/config.js`

```javascript
onboarding: {
    enabled: true,        // 是否启用（true/false）
    stepDuration: 0       // 自动下一步时间（0=不自动）
}
```

### 密码验证配置
位置：`js/modules/password.js`

```javascript
const PASSWORD_EXPIRY_DAYS = 7;  // 过期天数

export const password = {
    correctPassword: '123456',   // 默认密码
    // ...
};
```

---

## 💡 使用场景

### 新手引导适用场景
- ✅ 新用户首次访问
- ✅ 功能更新后重新引导
- ✅ 用户请求重新查看
- ✅ 培训或演示用途

### 密码验证适用场景
- ✅ 团队内部工具访问控制
- ✅ 防止未授权用户访问
- ✅ 定期更换访问凭证
- ✅ 简单的隐私保护

---

## ⚠️ 注意事项

### 新手引导
1. **页面结构变化** - 如果界面大幅调整，需要更新引导步骤
2. **动态元素** - 某些动态生成的元素可能无法高亮
3. **移动端体验** - 已优化移动端显示，但建议在真实设备上测试

### 密码验证
1. **安全性提醒** - 这是简单访问控制，不适用于高安全场景
2. **密码存储** - 密码存储在 localStorage，用户可以查看
3. **过期机制** - 基于本地时间，用户可以修改系统时间绕过
4. **建议用途** - 适合内部工具、测试环境、演示项目

---

## 🐛 故障排除

### 新手引导问题

**Q: 引导不显示？**
```javascript
// 检查引导状态
console.log(localStorage.getItem('onboardingCompleted'));
// 如果是 'true'，清除后刷新
localStorage.removeItem('onboardingCompleted');
location.reload();
```

**Q: 高亮元素不正确？**
- 检查 `onboarding.js` 中的 `steps` 配置
- 确保 `highlight` 字段对应的元素 ID 存在

**Q: 多语言不生效？**
- 检查 `translations.js` 中是否有对应语言的翻译
- 确保 `onboarding` 部分的翻译完整

### 密码验证问题

**Q: 密码验证不显示？**
```javascript
// 强制显示密码框
password.showPasswordModal();
```

**Q: 忘记密码？**
- 默认密码：`123456`
- 或联系管理员获取新密码

**Q: 密码不过期？**
```javascript
// 检查设置时间
console.log(localStorage.getItem('passwordSetTime'));
// 如果没有，手动触发过期
localStorage.removeItem('passwordSetTime');
location.reload();
```

---

## 📊 数据统计

### LocalStorage 使用

| 键名                  | 类型   | 说明           | 示例值         |
| --------------------- | ------ | -------------- | -------------- |
| `onboardingCompleted` | String | 引导完成状态   | `'true'`       |
| `accessPassword`      | String | 自定义密码     | `'mypass'`     |
| `passwordSetTime`     | Number | 密码设置时间戳 | `'1234567890'` |

---

## 🚀 后续优化建议

### 新手引导
- [ ] 添加引导动画效果
- [ ] 支持视频引导
- [ ] 添加进度保存功能
- [ ] 支持自定义引导内容
- [ ] 添加引导数据分析

### 密码验证
- [ ] 支持后端验证
- [ ] 添加密码强度检查
- [ ] 支持多用户密码
- [ ] 添加登录失败限制
- [ ] 支持密码重置邮件

---

## 📞 技术支持

如有问题或建议，请：
1. 查看 `TESTING.md` 详细测试指南
2. 查看 `README.md` 项目文档
3. 检查浏览器控制台错误信息
4. 提交 Issue 或联系开发者

---

**更新日期：** 2026-04-14  
**版本：** v1.1.0  
**作者：** Call Me Team
