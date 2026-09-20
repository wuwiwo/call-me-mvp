# 接手文档：14 项改动（2026-09-20）

> 本文是给**执行方 AI** 的完整施工图。主 AI 已完成代码摸底与设计稿取数，**未做任何改动**。
> 基线：`npm test` = 14 项 / **811 断言 / 0 失败** / ~314s；远端 = 本地 = `9c00488`。

---

## 0. Human 已拍板

| 决策点 | 结论 |
|---|---|
| 主题中文名 | bubble = **浮光絮语**；list = **青笺行** |
| 历史 tag | **真三态**（未回执 / 已回执 / 失败），需新增 `receipt` 字段并回写历史 |

---

## 1. 设计稿精确规格（Ardot 727742261679190）

### 11:485 「恢复默认按钮」（次级按钮）
填充 `rgba(55,53,47,.06)` / 描边 `rgba(55,53,47,.16)` / 圆角 **8** / padding `10px 24px` / 字 `15 SemiBold` / 色 `#37352F`

### 24:111 「顶部展开面板」
垂直 `gap:4` / padding `上8 右12 下16 左12`（**下 > 上**，视觉上"底部更空"）/ 白底 / 宽 375 / 阴影 `0 -8px 32px rgba(55,53,47,.14)`
项：高 **56** / 圆角 **14** / padding 10 / gap 10

### 24:127 「面板项 · 主题切换」（= hover 态）
填充 `rgba(15,163,128,.10)`（**淡绿**）/ 圆角 14 / 高 56 / 字 `14 SemiBold` 色 `#0BA380`
主题图标 = 2×2 四色方块，5×5 rect 于 (2,2)(9,2)(2,9)(9,9)：**#0FA480 / #337EA9 / #D4AF37 / #E9A15A**

### 18:38 「冷却与回执」（335×122，圆角 12，白底）
| 元素 | 规格 |
|---|---|
| 小头像 | 36×36，圆角 18，填 `rgba(55,53,47,.08)` 描 `rgba(55,53,47,.16)`，位 (16,14) |
| 昵称 | 16 Bold `rgba(0,0,0,.9)`，位 (65,22) — **左** |
| 回执徽章 | 胶囊圆角 999，填 `rgba(15,163,128,.13)`，字 13 Bold `#0BA380`，padding `8px 16px`，**右对齐**（x180 / 卡宽335） |
| 冷却条 | 宽 303，位 (16,58)，圆角 12，填 `rgba(224,243,239,.25)`，padding `12px 8px` |
| ├ 图标底 | 24×24 圆角 20，填 `rgba(15,163,128,.12)` |
| └ 冷却文案 | 14 Medium `rgba(55,53,47,.7)`，**左对齐** |

**新增令牌建议**：`--mint:#0fa480` `--mint-deep:#0BA380` `--mint-wash:rgba(15,163,128,.13)` `--mint-chip:rgba(15,163,128,.12)` `--mint-bg:rgba(224,243,239,.25)`

---

## 2. 分组施工图

### A 音效组（4 条）

**A1 iPhone 音效不生效 —— 三个成因，要一起修**（`js/modules/sounds.js`，69 行）

| # | 成因 | 修法 |
|---|---|---|
| 1 | `enabled` 仅内存，刷新即丢 | 加 `STORAGE_KEY='soundEnabled'`，构造时读、`toggle()` 时写，默认 `true` |
| 2 | iOS 音频**未解锁**：`new Audio(url).load()` 不解锁；首次 `play()` 必须在用户手势的同步栈内 | 加 `unlock()`：在首个 `pointerdown`（capture + once）里对每个已缓存 Audio 执行 `play() → pause() → currentTime=0`。**必须复用同一实例**，不要每次 `new Audio` |
| 3 | 失败被 `console.warn` 静默吞掉 | `play()` reject 时先尝试 `unlock()` 再重试一次；保留 warn 并存 `this.lastError` 便于排查 |
| 4 | 格式：现有 `success/error` 是 `.wav` | iOS 对 wav/ogg 支持不稳，`.m4a` 最稳。若上述修完仍不响 → 转 m4a（现有 `sounds/default-click.m4a` 可复用） |

**A2 全局 click 音效**
- `config.js:soundEffects` 增 `click: 'sounds/default-click.m4a'`（文件已存在）
- `sounds.js` 增 `playClick()`；内部加 **80ms 节流**（防一次点击触发多个委托）
- `main.js` `initModules()` 末尾挂委托（冒泡阶段即可）：
  ```js
  document.addEventListener('click', (e) => {
      if (e.target.closest('[data-no-click-sound]')) return;
      soundManager.playClick();
  });
  ```
- 已有专属音效的元素加 `data-no-click-sound`：`#userAvatar`（头像叫声）、`.bubble-btn`（发送通知音）

**A3 保存成功 toast + 成功音效**
- `notification.show(msg, true)` **已经会播成功音**（`notification.js:30`），所以只要改调用点即可：
  - `buttonManager.js:601` `notification.show('按钮配置已保存')` → `notification.show(t('common.saveSuccess'), true)`
  - `buttonManager.js:672`（resetToDefault）、`profile.js`（保存信息）同样处理
- `translations.js` 四语言增 `common.saveSuccess`

**A4 音效开关**
- `index.html` ⋯ 菜单内新增一项（放在主题区之后）：
  ```html
  <button id="toggleSound" class="more-item" data-sound-toggle>
      <i class="fas fa-volume-high"></i>
      <span class="more-item-label" data-i18n="sound.toggle">音效</span>
  </button>
  ```
- 新建 `js/modules/soundToggle.js`（单职责，与 `theme.js` 同构）：`init()` / `sync()` 更新图标（`fa-volume-high` ↔ `fa-volume-xmark`）与文案
- i18n 四语言增 `sound: { on:'音效：开', off:'音效：关' }`
- ⚠️ 历史页无 ⋯ 菜单 → 开关只在首页；历史页只读 `soundEnabled`

---

### B 主题组（4 条）

**B1 主题改名（浮光絮语 / 青笺行）**
- `js/modules/translations.js` 四语言 `theme.bubble` / `theme.list`：
  - zh：`浮光絮语` / `青笺行`
  - en / ja / ko：保持"光 · 纸笺"意象（en 建议 `Gleam Whisper` / `Cyan Scroll`；ja `浮光の便り` / `青箋の行`；ko 由执行方定）
- ⚠️ **`tools/theme-entry.mjs:617-618` 硬断言 `zh bubble = 气泡列表` / `zh list = 按钮列表`** → 必须同步改
- ⚠️ `zh.history.webhookLabel` **必须保持 `Webhook`**（`tools/input-safety.mjs:1024` 钉死），别误伤
- 同步 grep `docs/` 里的旧名

**B2 主题切换图标**
- 现状：`index.html:112` `fa-circle`、`:118` `fa-list`
- 改为设计稿 24:129 的四色方块 → 内联 SVG（16×16，四个 5×5 rect）
- ⚠️ CSS `index.css:1238` `.more-item > i:first-child { width:20px }` 只匹配 `<i>`；换成 `<span class="theme-swatch">` 后选择器要扩成
  `.more-item > i:first-child, .more-item > .theme-swatch:first-child`，否则宽度/对齐失效
- 两个主题建议用**同一个**四色方块（设计稿只给了一个），靠文案 + active 勾选区分

**B3 list 主题整体内容上移**
- `index.css:1383` `[data-theme='list'] .container { margin-top: 76px }` → 改小（建议 56px；≤480 断点 48px）
- `[data-theme='list'] { --container-padding: 20px 16px 24px }`（1369）→ 上边距收到 `12px`
- `index.css:1393` `[data-theme='list'] .header { margin-bottom: 20px }` → 16px
- ⚠️ 顶栏高度随断点为 **72 / 61 / 57**，不要写死单一数值推导

**B4 自定义按钮模态框适配 list 主题**（现状：`[data-theme='list']` **完全没覆盖模态框**）
新增：
```css
[data-theme='list'] #buttonEditModal .modal-content { border-radius: 14px; }
[data-theme='list'] .button-edit-item,
[data-theme='list'] .custom-button-form {
    background:#fff; border:1px solid rgba(55,53,47,.08);
    border-radius:14px; padding:12px;
}
[data-theme='list'] .buttons-edit-area { gap:12px; }
[data-theme='list'] .mode-indicator { background:rgba(15,164,127,.10); color:#0BA380; border-radius:999px; }
[data-theme='list'] .add-btn { background:rgba(15,164,127,.06); color:#0BA380; border:1px dashed #0FA480; }
[data-theme='list'] .modal-header { border-bottom-color: rgba(55,53,47,.08); }
[data-theme='list'] .save-btn { background:#0FA480; }
```

---

### C 按钮组（3 条）

**C1 「恢复默认」次级按钮 —— 根因已定位**
`index.html:275` 是 `class="btn"`，而 **`.btn` 在 CSS 里根本没有定义**（grep 无 `.btn {`）→ 所以它是浏览器默认样式，这正是"样式不统一"的根因。

```css
/* 必须定义在 .save-btn（index.css:1029）之前 */
.btn {
    font-family: inherit; font-size: 0.9375rem; font-weight: 600;
    border-radius: 8px; padding: 10px 24px; cursor: pointer;
    transition: all .2s var(--ease-premium);
}
.btn-secondary {                       /* 对齐 11:485 */
    background: rgba(55,53,47,.06);
    border: 1px solid rgba(55,53,47,.16);
    color: #37352f;
}
.btn-secondary:hover { background: rgba(55,53,47,.10); }
.modal-footer { gap: 12px; }           /* 与「保存设置」保间距（现有只给 confirm-modal 加了 gap） */
```
`index.html:275` → `class="btn btn-secondary"`
⚠️ `#saveProfile`（index.html:229）是 `class="btn save-btn"`，`.save-btn` 在后 → 覆盖 background/padding，需目视确认

**C2 按钮统一多彩颜色**
现状 `index.css:381-389` 只有 2 组（蓝/金），且只作用于**图标底**。
改为 6 色循环 `--c1..c6`（`#337EA9` `#D4AF37` `#0FA480` `#E9A15A` `#8A6BB1` `#E55050`）：
```css
.bubble-btn:nth-child(6n+1) .bubble-content i { background: rgba(...,.12); color: var(--c1); }
/* … 6n+2 .. 6n+6 */
```
⚠️ **必须整段替换**现有 `:nth-child(2n+1)/(2n)` 两条，不要叠加（叠加时后面的 6n 规则会覆盖前者，顺序极敏感）
增强（可选）：list 主题下加左侧 3px 同色竖条 `::before`；bubble 主题保持克制

**C3 按钮较多时保持「查看通知历史」可见**
- 现状：`#historyEntry` 在 `#homeView` 末尾（index.html:155），按钮多时被挤出视口
- **推荐低风险方案**：`.history-entry { position: sticky; bottom: 0; background: var(--container-bg); z-index: 5; }`
- 备选（风险高）：`#homeView` 改 flex column + `.bubble-container{ flex:1; overflow-y:auto; max-height:52vh }`
  ⚠️ 加滚动容器会影响 `tools/components.mjs` 里 CDP 真实坐标点击的命中（按钮可能滚出视口）—— 若要走这条，**单独一个 commit 并跑全量**

---

### D 编辑模态框（1 条）

**D2 「布局调整」按钮气泡提示**（`#toggleMode`，index.html:239）
```css
.mode-toggle { position: relative; }
.mode-toggle::after {
    content: attr(data-tip);
    position: absolute; top: calc(100% + 8px); right: 0;
    background: var(--surface-toast); color: #fff; font-size: .75rem;
    padding: 6px 10px; border-radius: 6px; white-space: nowrap;
    opacity: 0; visibility: hidden; transform: translateY(-4px);
    transition: all .2s var(--ease-premium); pointer-events: none; z-index: 20;
}
.mode-toggle:hover::after, .mode-toggle:focus-visible::after,
.mode-toggle.tip-once::after { opacity: 1; visibility: visible; transform: none; }
```
- `buttonManager.js:709` `updateModeDisplay()` 里 `toggleModeBtn.dataset.tip = utils.getTranslation('profile.layoutTip')`
- 首次打开模态框自动显示一次：`showEditModal()` 加 `.tip-once`，2.5s 后移除（用户明确说"提示用户这里可以点击"）
- i18n 四语言增 `profile.layoutTip`

---

### E 回执 / 冷却（2 条）

**E1 回执卡改新版（对齐 18:38）** —— **需动 DOM，风险最高**
现状（index.html:143-152）：`.countdown > .countdown-info(头像+名字+文案)` + `#receiptStatus` 在下方居中。

目标结构（**id 全部保留**，只调整层级与位置）：
```html
<div id="countdown" class="countdown">
  <div class="countdown-head">
    <div id="countdownAvatar" class="emoji-avatar"></div>
    <span id="countdownName"></span>
    <div id="receiptStatus" class="receipt-status"></div>   <!-- 提到行1右侧 -->
  </div>
  <div class="countdown-bar">
    <span class="countdown-bar-icon"><i class="fas fa-bolt"></i></span>
    <span id="countdownText"></span>
  </div>
</div>
```
- ⚠️ `tools/receipt-lifecycle.mjs`（54 项）断言 `#receiptStatus` 的 className（`receipt-status sent|read|timeout`）与 innerHTML —— **移动 DOM 不改 className 逻辑通常安全，但必须跑全量**
- 徽章在 list 主题下右对齐；bubble 主题保持居中（避免破坏既有观感）

**E2 文案左对齐（日文冷却文案不居中）**
- 根因：`.container { text-align:center }`（index.css:245）传给 `#countdownText`；list 主题的 `--title-align:left` 只作用于 `.header`
- 修：`[data-theme='list'] .container, [data-theme='list'] .countdown { text-align: left; }`
- `.receipt-status { margin: 12px auto 0 }`（index.css:417）在 list 主题下改 `margin: 0 0 0 auto`（右对齐，对齐设计稿徽章在右上）
- 用户举的是日文文案 → 说明问题是**全局**的（不分语言），按全局修

---

### F 历史页（3 条）

**F1 内容不垂直居中、整体上移**
- 根因：`body { display:flex; align-items:center; min-height:100vh }`（index.css:140-159）
- ⚠️ **注意现有死规则**：`history.css:327` `body.history-page` 与 `:333` `.history-container` **都没被使用** —— history.html 的 `<body>` 没有 `history-page` class，实际用的是 `.container`
- 修：`<body class="history-page">` + `body.history-page { align-items: flex-start; padding-top: 88px; }`（避让顶栏；顶栏 72/61/57 随断点浮动，可给 3 档媒体查询）
- 首页内嵌历史视图 `#homeHistoryView` **一起改**（用户可能指两处）

**F2 右上角三态 tag（真三态）**

*数据层（`notification.js`）*
1. `addHistoryRecord(message, isSuccess)`（:55）增参数 `msgId`，写入 `{ ..., msgId, receipt: isSuccess ? 'pending' : 'failed' }`
2. `sendNotification` 里 `msgId`（:94）已有，传入即可
3. 轮询命中 read（:238 前）→ `markReceipt(msgId,'read')`；timeout（:220 前）→ `markReceipt(msgId,'timeout')`
4. 新增 `markReceipt(msgId, state)`：读 `notificationHistory` → 找 **第一条** msgId 匹配 → 改 `receipt` → 写回；找不到则静默返回（兼容旧数据）

*渲染层（`history.js:114-160`）*
```js
const tagKind = item._status === 'error' ? 'failed'
              : item.receipt === 'read' ? 'read' : 'pending';
const tag = document.createElement('span');
tag.className = `history-tag ${tagKind}`;
tag.textContent = t(`history.tag.${tagKind}`);
itemEl.appendChild(tag);
```
- ⚠️ **XSS 纪律（与现有 `safeStatus` 同构）**：`tagKind` 必须是**闭合枚举**，绝不能把 LocalStorage 值直接拼进 class → 新增 `safeReceipt(v)` 白名单 `['pending','read','timeout']`
- CSS：`.history-item{ position:relative }` + `.history-tag{ position:absolute; top:12px; right:12px; }`
- i18n 四语言增 `history.tag.pending/read/failed`
- 兼容：旧记录无 `receipt` → pending（未回执）；`_status==='error'` 优先判 failed

**F3 「历史记录已清除」改为与发送通知一致的 toast**
- 现状：`history.clear()`（:174-182）自建 `.history-toast` 节点 —— ⚠️ **`history.css` 里根本没有 `.history-toast` 样式**，实际渲染为无样式裸文本，这正是"不一致"的一部分
- 修：history.html 预埋 `<div id="notification" class="notification"></div>`；`history.js` 改为 `notification.init(el)` + `notification.show(t('history.cleared'), true)`（第 2 参 true = 成功 → 自动带成功音 + success 样式，正好符合"与发送通知一致"）
- 首页内嵌视图（`homeHistory.js` 的 clear）同样改走 `notification.show`
- 删掉 `.history-toast` 那 8 行自建逻辑

---

### G 顶部更多栏（1 条）

**G1 面板对齐 24:111（底部圆角）+ hover 淡绿（24:127）**
```css
.more-item:hover, .more-item:focus-visible {
    background: rgba(15,163,128,.10);   /* 淡绿，对齐 24:127 */
    color: #0BA380;
}
.more-item:hover > i:first-child,
.more-item:hover > .theme-swatch:first-child { color: #0BA380; }
```
"底部有圆角"：设计稿 24:111 的 FRAME 无显式 cornerRadius（=0），但 padding-bottom 16 > top 8 → 视觉上底部更空。
**建议**：`窄屏 .more-panel { border-radius: 0 0 16px 16px; }` —— 保留顶/左/右三边直角（继续贴顶栏），只给底部两角 16px
✅ **已裁决（2026-09-20，Human）**：采用此方案。
`docs/DESIGN_THEME_SWITCH.md:32` 已同步改为「顶部两角直角 + 底部两角圆角 16」，
**施工时不要再回改该文档**。

---

## 3. 测试影响清单（改完必跑）

| 套件 | 影响 |
|---|---|
| `theme-entry.mjs:617-618` | **必改**：golden 主题名 → 浮光絮语 / 青笺行 |
| `receipt-lifecycle.mjs`（54） | E1 动 DOM 后必跑全量 |
| `components.mjs`（110） | B2 换 `<span>` 影响 `.more-item > i:first-child`；C3 滚动容器高风险 |
| `input-safety.mjs` | F2 tag 必须 `textContent` + 白名单；`zh.webhookLabel` 保持 `Webhook` |
| `history-language.mjs:281` | REQUIRED 只列 6 键，新增 3 键**不必**加（加了要四语言齐全） |
| `password-gate`(60) / `cooldown`(87) / `button-ids` | 回归 |

基线：`npm test` = 14 项 / 811 断言 / 0 失败

---

## 4. 建议 commit 顺序（6 个原子提交）

1. `feat(sound)` A1+A2+A3+A4：持久化 + iOS 解锁 + click 音效 + 开关
2. `feat(theme)` B1+B2：改名 + SVG 图标 + 同步 golden 断言
3. `style(theme)` B3+B4：list 上移 + 模态框适配
4. `style(button)` C1+C2+C3：次级按钮 + 多彩 + 历史入口可见
5. `feat(history)` F1+F2+F3：三态 tag + toast + 上移
6. `style(receipt)` E1+E2+G1：回执新版 + 左对齐 + 面板 hover 淡绿

---

## 5. 纪律红线（改前先看，违反会失败）

**单职责（唯一写入者）**
- `countdown.js` 独占 `canClick` / `lastClickTime` / `timer`
- `language.js` 独占 `currentLang`
- `config.js` 独占 `CONFIG.password` / `CONFIG.themes`
- `theme.js` 独占 `appTheme`
- `notification.js` 独占 `receiptPollTimer` + `generation`，**节奏 2s×15 不可改**
- `zh.history.webhookLabel` 必须保持 `Webhook`

**DOM 契约（tools 钉死，不可改 id）**
`#editButtons` `#editProfile` `#languageToggle` `#moreToggle` `#morePanel` `#moreBackdrop` `#countdownName` `#countdownText` `#countdownAvatar` `#receiptStatus`

**★ `el.click()` 盲区**：涉及浮层/遮罩/层叠的验证**必须**用 CDP `Input.dispatchMouseEvent` 真实坐标 + `document.elementFromPoint`，程序化 `click()` 不走命中测试（线上"⋯ 子菜单点不动"就是这么漏的）
**★ 修完 bug 必做反向验证**：人为把 bug 放回去重跑，确认新断言真的 FAIL

---

## 6. 本机执行坑（必读）

- **`git push` 必须用 Bash 工具**（PowerShell 下 `credential.helper=manager` 会 `cannot spawn sh` → `could not read Username`）：
  `git -c http.version=HTTP/1.1 -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main`
- bash 缺 `ls/cat/mkdir/dirname/head/tail` → 复杂逻辑写成 `.py`/`.mjs` 文件再跑；**`node -e`/`python -c` 会被 MSYS 吃掉引号**
- node：`C:\Users\dd\.workbuddy\binaries\node\versions\22.22.2-3\node.exe`
- 提交用 `git commit -F <file>`，信息文件用 **Write 工具**生成（shell 内联会留 `\"` 残留）
- 每次 checkout / merge / restore 后跑 `node tools/check-worktree.mjs`（级联删除守卫）
- `.prettierrc` `endOfLine:"auto"`，勿手工 `--write` 救行尾
