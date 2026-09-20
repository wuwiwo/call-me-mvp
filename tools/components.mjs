// S4 组件化回归脚本（可复现）
//
// 运行方式：
//   node tools/components.mjs
//
// 目标（对应 docs/TASK_CARDS.md 的 S4 ACCEPTANCE CRITERIA）：
//   1. 至少 3 个 UI 区块抽成独立组件模块（component / popupMenu / modal / iconPicker）
//   2. 组件接口标准化：render(container) / mount() / unmount() / update(props)
//   3. 产品行为不变（语言下拉、⋯ 菜单、两个模态框、图标选择器、确认对话框）
//
// 观测方式（不在生产代码里留测试钩子）：
//   - 组件"可独立 import 并 render"：在页面里 `await import('/js/components/*.js')`，
//     挂到一个游离容器上验证，不碰页面已有 DOM
//   - 行为不变：一律用 `el.click()` 走真实交互路径，只读 DOM 与 localStorage
//   - 源码级断言用 Node 侧 readFileSync
//
// 依赖：仅 Node 内置模块 + 本机 Chrome，零 npm 依赖。
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, mkdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChrome } from './chrome-path.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SERVE_PORT = Number(process.env.COMPONENTS_PORT || 8899);
const EXTERNAL = process.env.COMPONENTS_NO_SERVER === '1';
const BASE = process.env.COMPONENTS_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.COMPONENTS_CDP_PORT || 9453);
// Chrome 路径解析统一到 tools/chrome-path.mjs（CM-009）
const CHROME = resolveChrome(process.env.COMPONENTS_CHROME);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

let staticServer = null;
if (!EXTERNAL) {
    await new Promise((resolve, reject) => {
        staticServer = http.createServer((req, res) => {
            let rel = decodeURIComponent(req.url.split('?')[0]);
            if (rel === '/') rel = '/index.html';
            const fp = path.join(ROOT, rel);
            if (!fp.startsWith(ROOT)) {
                res.writeHead(403);
                res.end('forbidden');
                return;
            }
            let st;
            try {
                st = statSync(fp);
            } catch {
                res.writeHead(404);
                res.end('not found');
                return;
            }
            if (!st.isFile()) {
                res.writeHead(404);
                res.end('not found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            createReadStream(fp).pipe(res);
        });
        staticServer.on('error', reject);
        staticServer.listen(SERVE_PORT, '127.0.0.1', () => resolve());
    });
}

const cleanEnv = { ...process.env };
for (const k of Object.keys(cleanEnv)) if (/proxy/i.test(k)) delete cleanEnv[k];
cleanEnv.NO_PROXY = '127.0.0.1,localhost';
cleanEnv.no_proxy = '127.0.0.1,localhost';

const PROFILE = path.join(os.tmpdir(), 's4-components-profile');
mkdirSync(PROFILE, { recursive: true });
const chromeProc = spawn(
    CHROME,
    [
        '--headless=new',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${PROFILE}`,
        '--no-first-run',
        '--disable-gpu',
        '--no-sandbox',
        '--no-proxy-server',
        '--proxy-bypass-list=<-loopback>',
        'about:blank'
    ],
    { stdio: 'ignore', env: cleanEnv }
);

function httpGetJson(pathname) {
    return new Promise((resolve, reject) => {
        const req = http.get(
            { host: '127.0.0.1', port: CDP_PORT, path: pathname, timeout: 4000 },
            (res) => {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (c) => (body += c));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        reject(new Error('bad json: ' + body.slice(0, 120)));
                    }
                });
            }
        );
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

async function getWsUrl() {
    for (let i = 0; i < 60; i++) {
        try {
            const j = await httpGetJson('/json/version');
            if (j.webSocketDebuggerUrl)
                return j.webSocketDebuggerUrl.replace('localhost', '127.0.0.1');
        } catch {
            /* retry */
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('CDP 未就绪：Chrome 是否启动？端口 ' + CDP_PORT);
}

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        ws.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(JSON.stringify(msg.error)));
                else resolve(msg.result);
            }
        });
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id;
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        this.ws.send(JSON.stringify(payload));
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error('timeout: ' + method));
                }
            }, 20000);
        });
    }
}

console.log('=== S4 组件化回归 ===\n');

const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
});
const cdp = new CDP(ws);

const { targetInfos } = await cdp.send('Target.getTargets');
let target = targetInfos.find((t) => t.type === 'page');
if (!target) {
    const r = await cdp.send('Target.createTarget', { url: 'about:blank' });
    target = { targetId: r.targetId };
}
const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true
});
const S = sessionId;
await cdp.send('Page.enable', {}, S);
await cdp.send('Runtime.enable', {}, S);

const pageErrors = [];
ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
        pageErrors.push(
            m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text
        );
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        pageErrors.push(
            'console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' ')
        );
    }
});

const ver = await httpGetJson('/json/version');
console.log('[环境]');
console.log('  测试 URL :', BASE);
console.log('  Chrome   :', CHROME);
console.log('  浏览器   :', ver.Browser);
console.log('  CDP 端口 :', CDP_PORT);
console.log('');

async function evalJs(expr) {
    const r = await cdp.send(
        'Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true },
        S
    );
    if (r.exceptionDetails) {
        throw new Error(
            '页面内异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)
        );
    }
    return r.result.value;
}

async function goto(url) {
    await cdp.send('Page.navigate', { url }, S);
    for (let i = 0; i < 80; i++) {
        try {
            if ((await evalJs('document.readyState')) === 'complete') break;
        } catch {
            /* navigating */
        }
        await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 400));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const failedItems = [];
function check(name, cond, extra = '') {
    if (cond) {
        pass++;
        console.log(`  PASS  ${name}`);
    } else {
        fail++;
        failedItems.push(name + (extra ? ' -> ' + extra : ''));
        console.log(`  FAIL  ${name}${extra ? ' -> ' + extra : ''}`);
    }
}

/** 预置 LocalStorage 后加载指定页面（走真实 init 路径）。 */
async function seed(page, entries = {}) {
    // 先落在站点域下：about:blank 上访问 localStorage 会被拒（SecurityError）
    if (!page.startsWith('http')) {
        try {
            await goto(BASE + '/index.html');
        } catch {
            /* 首帧可能还没就绪，忽略 */
        }
    }
    const lines = Object.entries(entries)
        .map(([k, v]) =>
            v === null
                ? `localStorage.removeItem(${JSON.stringify(k)});`
                : `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(String(v))});`
        )
        .join('\n        ');
    await evalJs(`(() => {
        localStorage.clear();
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('appLanguage', 'zh');
        localStorage.setItem('userProfile', JSON.stringify({ nickname: '测试用户', emoji: '🐶' }));
        localStorage.setItem('passwordSetTime', String(Date.now()));
        ${lines}
        return true;
    })()`);
    await goto(BASE + page);
}

// ══════════════════════════════════════════════════════════════
// 1. 源码级：组件层成立 + 消费方已改为用组件
// ══════════════════════════════════════════════════════════════
console.log('[1] 源码级：组件层成立 + 消费方改造');

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const COMPONENT_FILES = [
    'js/components/component.js',
    'js/components/popupMenu.js',
    'js/components/modal.js',
    'js/components/iconPicker.js'
];
for (const f of COMPONENT_FILES) {
    let ok = true;
    try {
        read(f);
    } catch {
        ok = false;
    }
    check(`组件文件存在：${f}`, ok);
}

const componentSrc = read('js/components/component.js');
check(
    'component.js 定义 render/mount/unmount/update 四个方法',
    /render\s*\(/.test(componentSrc) &&
        /mount\s*\(/.test(componentSrc) &&
        /unmount\s*\(/.test(componentSrc) &&
        /update\s*\(/.test(componentSrc)
);
check('component.js render 幂等（mounted 标记）', /this\.mounted/.test(componentSrc));

const themeSrc = read('js/modules/theme.js');
const languageSrc = read('js/modules/language.js');
const profileSrc = read('js/modules/profile.js');
const buttonSrc = read('js/modules/buttonManager.js');

check(
    'theme.js 消费 popupMenu 组件',
    /components\/popupMenu\.js/.test(themeSrc) && /createPopupMenu\s*\(/.test(themeSrc)
);
check(
    'language.js 消费 popupMenu 组件',
    /components\/popupMenu\.js/.test(languageSrc) && /createPopupMenu\s*\(/.test(languageSrc)
);
check(
    'profile.js 消费 modal 组件',
    /components\/modal\.js/.test(profileSrc) && /createModal\s*\(/.test(profileSrc)
);
check(
    'buttonManager.js 消费 modal + iconPicker 组件',
    /components\/modal\.js/.test(buttonSrc) &&
        /components\/iconPicker\.js/.test(buttonSrc) &&
        /createModal\s*\(/.test(buttonSrc) &&
        /createIconPicker\s*\(/.test(buttonSrc)
);

check(
    'buttonManager 不再自带图标选择器实现',
    !/createIconOption\s*\(/.test(buttonSrc) && !/pickerGlyph/.test(buttonSrc)
);
check(
    'buttonManager 不再自带确认对话框实现',
    !/showConfirmDialog/.test(buttonSrc) && /modal\.confirm\s*\(/.test(buttonSrc)
);
check(
    'language.js 不再自带菜单遮罩与开合实现',
    !/addBackdrop\s*\(/.test(languageSrc) &&
        !/removeBackdrop\s*\(/.test(languageSrc) &&
        !/toggleLanguageMenu\s*\(/.test(languageSrc)
);
check(
    'theme.js 不再自带菜单开合实现',
    !/openMenu\s*\(/.test(themeSrc) && !/closeMenu\s*\(/.test(themeSrc)
);

// ══════════════════════════════════════════════════════════════
// 2. 组件可独立 import 并 render（不依赖全局状态）
// ══════════════════════════════════════════════════════════════
console.log('\n[2] 组件可独立 import 并 render');

await seed('/index.html');

const iface = await evalJs(`(async () => {
    const out = {};
    const methods = ['render', 'mount', 'unmount', 'update'];

    for (const name of ['component.js', 'popupMenu.js', 'modal.js', 'iconPicker.js']) {
        try {
            await import('/js/components/' + name);
            out[name] = { imported: true };
        } catch (e) {
            out[name] = { imported: false, error: String(e && e.message) };
        }
    }

    // modal：造一个游离节点，接管它
    const { createModal } = await import('/js/components/modal.js');
    const host = document.createElement('div');
    const modalEl = document.createElement('div');
    modalEl.className = 'modal';
    modalEl.innerHTML = '<div class="modal-content"><button class="close-btn">&times;</button></div>';
    host.appendChild(modalEl);
    const m = createModal(modalEl);
    const mSame = m.render(host) === m;
    out.modal = {
        ...out.modal,
        methods: methods.every((k) => typeof m[k] === 'function'),
        renderReturnsSelf: mSame,
        mounted: m.mounted === true,
        detachedOpen: (() => { m.open(); return m.isOpen(); })(),
        detachedClose: (() => { m.close(); return !m.isOpen(); })(),
        idempotent: (() => { m.render(host); return m.mounted === true; })()
    };

    // popupMenu：造 toggle + panel
    const { createPopupMenu } = await import('/js/components/popupMenu.js');
    const menuHost = document.createElement('div');
    const toggle = document.createElement('button');
    const panel = document.createElement('div');
    const item = document.createElement('button');
    item.className = 'more-item';
    panel.appendChild(item);
    menuHost.appendChild(toggle);
    menuHost.appendChild(panel);
    let picked = 0;
    const pm = createPopupMenu({
        toggle,
        panel,
        itemSelector: '.more-item',
        onSelect: () => { picked += 1; }
    });
    pm.render(menuHost);
    pm.open();
    const opened = pm.isOpen() && toggle.classList.contains('active');
    // 点菜单项 → onSelect 触发且菜单关闭
    item.click();
    out.popupMenu = {
        methods: methods.every((k) => typeof pm[k] === 'function'),
        opened,
        selectedAndClosed: picked === 1 && !pm.isOpen(),
        afterCloseToggleInactive: !toggle.classList.contains('active')
    };
    pm.unmount();

    // iconPicker：造一个独立选择器
    const { createIconPicker } = await import('/js/components/iconPicker.js');
    const { CONFIG } = await import('/js/modules/config.js');
    const pickerHost = document.createElement('div');
    const picker = createIconPicker({
        icons: CONFIG.buttons.availableIcons,
        allowed: new Set([...(CONFIG.buttons.availableIcons || []), 'random']),
        fallback: 'random',
        selected: 'bolt',
        labels: (n) => n
    });
    picker.render(pickerHost);
    out.iconPicker = {
        methods: methods.every((k) => typeof picker[k] === 'function'),
        inDom: pickerHost.querySelector('.icon-picker') !== null,
        dataValue: picker.el.dataset.value,
        optionCount: picker.el.querySelectorAll('.icon-picker-option').length,
        expectedOptions: (CONFIG.buttons.availableIcons || []).length + 1,
        getValue: picker.getValue()
    };
    // 白名单外的值：显示回退，但 data-value 保留原值（不静默丢数据）
    const unknownPicker = createIconPicker({
        icons: CONFIG.buttons.availableIcons,
        allowed: new Set([...(CONFIG.buttons.availableIcons || []), 'random']),
        fallback: 'random',
        selected: 'not-configured',
        labels: (n) => n
    });
    unknownPicker.render(pickerHost);
    out.unknownIcon = {
        dataValue: unknownPicker.el.dataset.value,
        triggerIcon: unknownPicker.el.querySelector('.icon-picker-trigger i').className,
        noOptionSelected: unknownPicker.el.querySelectorAll('.icon-picker-option.selected').length
    };

    return out;
})()`);

for (const name of ['component.js', 'popupMenu.js', 'modal.js', 'iconPicker.js']) {
    check(`独立 import：${name}`, iface[name]?.imported === true, iface[name]?.error || '');
}

check('modal 实例四方法齐全', iface.modal.methods === true);
check('modal.render() 返回自身', iface.modal.renderReturnsSelf === true);
check('modal.render() 后 mounted=true', iface.modal.mounted === true);
check('modal 游离节点可 open/isOpen', iface.modal.detachedOpen === true);
check('modal close 后 isOpen=false', iface.modal.detachedClose === true);
check('modal.render() 幂等（不重复 mount）', iface.modal.idempotent === true);

check('popupMenu 实例四方法齐全', iface.popupMenu.methods === true);
check('popupMenu open 后面板展开且 toggle active', iface.popupMenu.opened === true);
check('popupMenu 点菜单项 → onSelect + 自动关闭', iface.popupMenu.selectedAndClosed === true);
check('popupMenu 关闭后 toggle 去掉 active', iface.popupMenu.afterCloseToggleInactive === true);

check('iconPicker 实例四方法齐全', iface.iconPicker.methods === true);
check('iconPicker render 后进入容器', iface.iconPicker.inDom === true);
check('iconPicker data-value = 传入的选中值', iface.iconPicker.dataValue === 'bolt');
check(
    'iconPicker 选项数 = availableIcons + 随机项',
    iface.iconPicker.optionCount === iface.iconPicker.expectedOptions,
    `${iface.iconPicker.optionCount} vs ${iface.iconPicker.expectedOptions}`
);
check('iconPicker getValue() 取回存储值', iface.iconPicker.getValue === 'bolt');
check('白名单外图标：data-value 保留原值', iface.unknownIcon.dataValue === 'not-configured');
check(
    '白名单外图标：预览字形回退（不出现 fa-not-configured）',
    !/fa-not-configured/.test(iface.unknownIcon.triggerIcon),
    iface.unknownIcon.triggerIcon
);
check('白名单外图标：没有任何选项被误选中', iface.unknownIcon.noOptionSelected === 0);

// ══════════════════════════════════════════════════════════════
// 3. 产品行为不变：语言下拉
// ══════════════════════════════════════════════════════════════
console.log('\n[3] 产品行为不变：语言下拉');

await seed('/index.html');
await sleep(200);

const langBefore = await evalJs(`document.getElementById('currentLanguage').textContent`);
await evalJs(`document.getElementById('languageToggle').click()`);
await sleep(320);
const langOpen = await evalJs(`(() => {
    const menu = document.getElementById('languageMenu');
    return {
        open: menu.classList.contains('show'),
        toggleActive: document.getElementById('languageToggle').classList.contains('active'),
        backdrop: document.getElementById('languageDropdownBackdrop') !== null
    };
})()`);
check('点语言胶囊 → 菜单展开', langOpen.open === true);
check('点语言胶囊 → toggle 加 active', langOpen.toggleActive === true);
check('语言菜单展开时创建遮罩节点（保持既有形态）', langOpen.backdrop === true);

await evalJs(`document.querySelector('.language-option[data-lang="en"]').click()`);
await sleep(320);
const langAfter = await evalJs(`(() => {
    const menu = document.getElementById('languageMenu');
    return {
        display: document.getElementById('currentLanguage').textContent,
        stored: localStorage.getItem('appLanguage'),
        closed: !menu.classList.contains('show'),
        backdrop: document.getElementById('languageDropdownBackdrop') !== null,
        activeOption: document.querySelector('.language-option.active')?.dataset.lang || null
    };
})()`);
check('选语言 → 显示变为 EN', langAfter.display === 'EN', langAfter.display);
check('选语言 → 写入 localStorage', langAfter.stored === 'en');
check('选语言 → 菜单关闭', langAfter.closed === true);
check('选语言 → 遮罩节点被移除', langAfter.backdrop === false);
check('选语言 → 当前语言项加 active', langAfter.activeOption === 'en', langAfter.activeOption);
check('切语言前中文显示正常', ['中', 'EN', 'JA', 'KO'].includes(langBefore));

// 点页面别处关闭
await evalJs(`document.getElementById('languageToggle').click()`);
await sleep(320);
await evalJs(`document.body.click()`);
await sleep(320);
const langOutside = await evalJs(
    `!document.getElementById('languageMenu').classList.contains('show')`
);
check('点页面别处 → 语言菜单关闭', langOutside === true);

// ══════════════════════════════════════════════════════════════
// 4. 产品行为不变：⋯ 菜单
// ══════════════════════════════════════════════════════════════
console.log('\n[4] 产品行为不变：⋯ 菜单');

await seed('/index.html', { appTheme: 'bubble' });
await sleep(200);

await evalJs(`document.getElementById('moreToggle').click()`);
await sleep(320);
const moreOpen = await evalJs(`(() => {
    const panel = document.getElementById('morePanel');
    return {
        open: panel.classList.contains('show'),
        backdrop: document.getElementById('moreBackdrop').classList.contains('show'),
        checked: document.querySelector('#morePanel [data-theme-name].active')?.dataset.themeName || null
    };
})()`);
check('点 ⋯ → 面板展开', moreOpen.open === true);
check('点 ⋯ → 预埋遮罩加 show', moreOpen.backdrop === true);
check('打开时已勾中当前主题 bubble', moreOpen.checked === 'bubble', moreOpen.checked);

await evalJs(`document.getElementById('moreBackdrop').click()`);
await sleep(320);
const moreClosedByBackdrop = await evalJs(
    `!document.getElementById('morePanel').classList.contains('show')`
);
check('点遮罩 → ⋯ 菜单关闭', moreClosedByBackdrop === true);

await evalJs(`document.getElementById('moreToggle').click()`);
await sleep(320);
await evalJs(`document.querySelector('#morePanel [data-theme-name="list"]').click()`);
await sleep(320);
const moreTheme = await evalJs(`(() => ({
    theme: localStorage.getItem('appTheme'),
    attr: document.documentElement.getAttribute('data-theme'),
    closed: !document.getElementById('morePanel').classList.contains('show'),
    checked: document.querySelector('#morePanel [data-theme-name].active')?.dataset.themeName || null
}))()`);
check('点主题项 → 主题切到 list 并持久化', moreTheme.theme === 'list');
check('点主题项 → <html data-theme> 同步', moreTheme.attr === 'list');
check('点主题项 → 菜单关闭', moreTheme.closed === true);
check('切主题后菜单勾选同步', moreTheme.checked === 'list');

// #editButtons 收在菜单里，仍要能打开编辑模态框
await evalJs(`document.getElementById('moreToggle').click()`);
await sleep(320);
await evalJs(`document.getElementById('editButtons').click()`);
await sleep(320);
const editFromMenu = await evalJs(`(() => ({
    modalOpen: document.getElementById('buttonEditModal').classList.contains('show'),
    menuClosed: !document.getElementById('morePanel').classList.contains('show')
}))()`);
check('菜单里点「自定义按钮」→ 打开编辑模态框', editFromMenu.modalOpen === true);
check('菜单里点「自定义按钮」→ 菜单同时关闭', editFromMenu.menuClosed === true);

// ══════════════════════════════════════════════════════════════
// 5. 产品行为不变：两个预埋模态框
// ══════════════════════════════════════════════════════════════
console.log('\n[5] 产品行为不变：两个预埋模态框');

await seed('/index.html');
await sleep(200);

// 资料模态框：关闭按钮 / 点遮罩
await evalJs(`document.getElementById('editProfile').click()`);
await sleep(320);
const profileOpen = await evalJs(
    `document.getElementById('profileModal').classList.contains('show')`
);
check('点「编辑资料」→ 资料模态框打开', profileOpen === true);

await evalJs(`document.querySelector('#profileModal .close-btn').click()`);
await sleep(220);
check(
    '点关闭按钮 → 资料模态框关闭',
    (await evalJs(`!document.getElementById('profileModal').classList.contains('show')`)) === true
);

await evalJs(`document.getElementById('editProfile').click()`);
await sleep(320);
await evalJs(`document.getElementById('profileModal').click()`);
await sleep(220);
check(
    '点遮罩 → 资料模态框关闭',
    (await evalJs(`!document.getElementById('profileModal').classList.contains('show')`)) === true
);

// 按钮编辑模态框：关闭按钮 / 点遮罩
await evalJs(`document.getElementById('editButtons').click()`);
await sleep(320);
check(
    '点「自定义按钮」→ 编辑模态框打开',
    (await evalJs(`document.getElementById('buttonEditModal').classList.contains('show')`)) === true
);

await evalJs(`document.getElementById('closeButtonEdit').click()`);
await sleep(220);
check(
    '点 #closeButtonEdit → 编辑模态框关闭',
    (await evalJs(`!document.getElementById('buttonEditModal').classList.contains('show')`)) ===
        true
);

await evalJs(`document.getElementById('editButtons').click()`);
await sleep(320);
await evalJs(`document.getElementById('buttonEditModal').click()`);
await sleep(220);
check(
    '点遮罩 → 编辑模态框关闭',
    (await evalJs(`!document.getElementById('buttonEditModal').classList.contains('show')`)) ===
        true
);

// ══════════════════════════════════════════════════════════════
// 6. 产品行为不变：图标选择器
// ══════════════════════════════════════════════════════════════
console.log('\n[6] 产品行为不变：图标选择器');

await seed('/index.html');
await sleep(200);
await evalJs(`document.getElementById('editButtons').click()`);
await sleep(400);

const pickerState = await evalJs(`(() => {
    const cfg = window.__cfg || null;
    const picker = document.getElementById('button1Icon');
    if (!picker) return { missing: true };
    return {
        missing: false,
        cls: picker.className,
        dataValue: picker.dataset.value,
        triggerIcon: picker.querySelector('.icon-picker-trigger i').className,
        label: picker.querySelector('.icon-picker-label').textContent,
        options: picker.querySelectorAll('.icon-picker-option').length,
        selected: picker.querySelectorAll('.icon-picker-option.selected').length
    };
})()`);
check('编辑表单里渲染出 #button1Icon', pickerState.missing === false);
check('选择器根节点 class = icon-picker', pickerState.cls === 'icon-picker', pickerState.cls);
check(
    '选择器 data-value 有值',
    typeof pickerState.dataValue === 'string' && !!pickerState.dataValue
);
check('选择器 trigger 使用允许列表内的字形', /^fas fa-[a-z0-9-]+$/.test(pickerState.triggerIcon));
check('选择器有显示名', typeof pickerState.label === 'string' && pickerState.label.length > 0);
check('选择器选项数 > 1', pickerState.options > 1, String(pickerState.options));
check('已有图标被正确预选（1 项选中）', pickerState.selected === 1, String(pickerState.selected));

const expectedOptions = await evalJs(`(async () => {
    const { CONFIG } = await import('/js/modules/config.js');
    return (CONFIG.buttons.availableIcons || []).length + 1;
})()`);
check(
    '选项数 = availableIcons + 随机项',
    pickerState.options === expectedOptions,
    `${pickerState.options} vs ${expectedOptions}`
);

// 打开菜单 → 选第二项 → data-value 与预览同步
await evalJs(`document.querySelector('#button1Icon .icon-picker-trigger').click()`);
await sleep(250);
const menuShown = await evalJs(
    `document.querySelector('#button1Icon .icon-picker-menu').classList.contains('show')`
);
check('点 trigger → 图标菜单展开', menuShown === true);

const secondValue = await evalJs(`(() => {
    const opts = document.querySelectorAll('#button1Icon .icon-picker-option');
    return opts[1].dataset.value;
})()`);
await evalJs(`document.querySelectorAll('#button1Icon .icon-picker-option')[1].click()`);
await sleep(250);
const afterPick = await evalJs(`(() => {
    const picker = document.getElementById('button1Icon');
    return {
        dataValue: picker.dataset.value,
        menuHidden: !picker.querySelector('.icon-picker-menu').classList.contains('show'),
        selected: picker.querySelectorAll('.icon-picker-option.selected').length,
        label: picker.querySelector('.icon-picker-label').textContent
    };
})()`);
check('选图标 → data-value 更新', afterPick.dataValue === secondValue, afterPick.dataValue);
check('选图标 → 菜单收起', afterPick.menuHidden === true);
check('选图标 → 只有 1 项选中', afterPick.selected === 1, String(afterPick.selected));

// 保存 → 写回 LocalStorage
await evalJs(`(() => {
    const input = document.getElementById('button1Text');
    input.value = '组件化测试';
    document.getElementById('saveButtons').click();
    return true;
})()`);
await sleep(400);
const saved = await evalJs(`(() => {
    const cfg = JSON.parse(localStorage.getItem('buttonConfig') || '{}');
    return {
        message: cfg.buttons?.[0]?.message || null,
        icon: cfg.buttons?.[0]?.icon || null,
        modalClosed: !document.getElementById('buttonEditModal').classList.contains('show')
    };
})()`);
check('保存 → 文案写入 buttonConfig', saved.message === '组件化测试', saved.message);
check('保存 → 图标写入 buttonConfig（取 data-value）', saved.icon === secondValue, saved.icon);
check('保存 → 编辑模态框关闭', saved.modalClosed === true);

// ══════════════════════════════════════════════════════════════
// 7. 产品行为不变：确认对话框（重置为默认）
// ══════════════════════════════════════════════════════════════
console.log('\n[7] 产品行为不变：确认对话框');

const defaultCount = await evalJs(`(async () => {
    const { CONFIG } = await import('/js/modules/config.js');
    return CONFIG.buttons.defaultButtons.length;
})()`);

await seed('/index.html');
await sleep(200);
// 先加一个自定义按钮，让"重置"有可观测的效果
await evalJs(`(() => {
    const cfg = JSON.parse(localStorage.getItem('buttonConfig') || '{}');
    cfg.buttons = (cfg.buttons || []).concat([
        { id: 'custom_test_1', message: '待清除', icon: 'gift' }
    ]);
    localStorage.setItem('buttonConfig', JSON.stringify(cfg));
    return true;
})()`);
await goto(BASE + '/index.html');
await sleep(300);
const beforeReset = await evalJs(`document.querySelectorAll('.bubble-btn').length`);
check('重置前按钮数 > 默认数（有可观测差异）', beforeReset > defaultCount, String(beforeReset));

await evalJs(`document.getElementById('editButtons').click()`);
await sleep(400);
await evalJs(`document.getElementById('resetButtons').click()`);
await sleep(300);
const confirmShown = await evalJs(`(() => {
    const el = document.querySelector('.confirm-modal');
    if (!el) return { missing: true };
    return {
        missing: false,
        hasCancel: el.querySelector('.confirm-cancel-btn') !== null,
        hasOk: el.querySelector('.confirm-ok-btn') !== null,
        message: el.querySelector('.confirm-message').textContent
    };
})()`);
check('点「恢复默认」→ 出现确认对话框', confirmShown.missing === false);
check('确认对话框有取消按钮', confirmShown.hasCancel === true);
check('确认对话框有确认按钮', confirmShown.hasOk === true);
check('确认对话框消息非空', (confirmShown.message || '').length > 0);

// 取消 → 不重置
await evalJs(`document.querySelector('.confirm-cancel-btn').click()`);
await sleep(300);
const afterCancel = await evalJs(`(() => ({
    gone: document.querySelector('.confirm-modal') === null,
    count: document.querySelectorAll('.bubble-btn').length
}))()`);
check('点取消 → 对话框销毁', afterCancel.gone === true);
check(
    '点取消 → 按钮数不变（未重置）',
    afterCancel.count === beforeReset,
    String(afterCancel.count)
);

// 确认 → 重置
await evalJs(`document.getElementById('resetButtons').click()`);
await sleep(300);
await evalJs(`document.querySelector('.confirm-ok-btn').click()`);
await sleep(400);
const afterOk = await evalJs(`(() => ({
    gone: document.querySelector('.confirm-modal') === null,
    count: document.querySelectorAll('.bubble-btn').length,
    firstMessage: document.querySelector('.bubble-btn .bubble-content span')?.textContent || ''
}))()`);
check('点确认 → 对话框销毁', afterOk.gone === true);
check('点确认 → 恢复默认按钮数', afterOk.count === defaultCount, String(afterOk.count));

// ══════════════════════════════════════════════════════════════
// 8. 页面无异常
// ══════════════════════════════════════════════════════════════
console.log('\n[8] 页面无异常');
check('运行期间无 console.error / 未捕获异常', pageErrors.length === 0, pageErrors.join(' | '));

// ══════════════════════════════════════════════════════════════
console.log(`\n断言：${pass} passed, ${fail} failed`);
if (fail) {
    console.log('\n失败项：');
    failedItems.forEach((x) => console.log('  - ' + x));
}

try {
    ws.close();
} catch {
    /* ignore */
}
try {
    chromeProc.kill();
} catch {
    /* ignore */
}
if (staticServer) staticServer.close();
process.exit(fail ? 1 : 0);
