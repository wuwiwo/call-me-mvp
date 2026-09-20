// S3 切换入口（甲顶栏 + 新主题布局 + 首页内历史视图）回归脚本（可复现）
//
// 运行方式：
//   node tools/theme-entry.mjs
//
// 目标（对应 docs/TASK_CARDS.md 的 S3 ACCEPTANCE CRITERIA）：
//   1. #editButtons / #editProfile 仍在 DOM（DOM 契约被 tools 钉死）
//   2. ⋯ 菜单从顶栏下方展开，点遮罩关闭
//   3. 主题切换生效：切到 list 后布局令牌变化，切回 bubble 恢复
//   4. 历史入口不跳转：点击后首页内切换视图，URL 不变
//   5. 4 语言文案齐全且取值互不相同
//
// 观测方式（不在生产代码里留测试钩子）：
//   - 预置 LocalStorage + 重新加载，走真实 main.js → theme.init() 路径
//   - 只读 DOM 与 getComputedStyle；点击一律用 el.click()（隐藏元素也可点击，
//     与既有套件驱动 #editButtons 的方式一致）
//   - 源码级断言用 Node 侧 readFileSync（不依赖页面）
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

const SERVE_PORT = Number(process.env.THEMEENTRY_PORT || 8899);
const EXTERNAL = process.env.THEMEENTRY_NO_SERVER === '1';
const BASE = process.env.THEMEENTRY_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.THEMEENTRY_CDP_PORT || 9452);
// Chrome 路径解析统一到 tools/chrome-path.mjs（CM-009）
const CHROME = resolveChrome(process.env.THEMEENTRY_CHROME);

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

const PROFILE = path.join(os.tmpdir(), 's3-theme-entry-profile');
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

console.log('=== S3 切换入口回归 ===\n');

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
        ${lines}
        return true;
    })()`);
    await goto(BASE + page);
}

// ══════════════════════════════════════════════════════════════
// 1. 源码级：DOM 契约与 4 语言文案
// ══════════════════════════════════════════════════════════════
console.log('[1] 源码级：DOM 契约与 4 语言文案');

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const indexHtml = read('index.html');
const indexCss = read('index.css');
const trSrc = read('js/modules/translations.js');
const themeSrc = read('js/modules/theme.js');
const mainSrc = read('js/main.js');

check('index.html 仍有 #editButtons（DOM 契约）', /id="editButtons"/.test(indexHtml));
check('index.html 仍有 #editProfile（DOM 契约）', /id="editProfile"/.test(indexHtml));
check(
    'index.html 仍有 #languageToggle（history-language.mjs:732 钉死）',
    /id="languageToggle"/.test(indexHtml)
);
check(
    '⋯ 菜单三件套齐全',
    /id="moreToggle"/.test(indexHtml) &&
        /id="morePanel"/.test(indexHtml) &&
        /id="moreBackdrop"/.test(indexHtml)
);
check(
    '历史入口与内嵌视图预埋在 html（不在运行时创建）',
    /id="historyEntry"/.test(indexHtml) &&
        /id="homeHistoryView"/.test(indexHtml) &&
        /id="homeHistoryList"/.test(indexHtml)
);
check(
    'main.js 不再动态创建跳转按钮',
    !/window\.location\.href\s*=\s*'history\.html'/.test(mainSrc)
);
check(
    '⋯ 菜单的开合由 popupMenu 组件承载，theme.js 只注入主题语义',
    /components\/popupMenu\.js/.test(themeSrc) &&
        /createPopupMenu\s*\(/.test(themeSrc) &&
        /onSelect/.test(themeSrc) &&
        /onSync/.test(themeSrc)
);
check('index.css 含 [data-theme="list"] 布局块', /\[data-theme=['"]list['"]\]/.test(indexCss));

// 4 语言新增键：齐全 + 四语言取值互不相同
const NEW_KEYS = [
    'common.more',
    'theme.sectionTitle',
    'theme.bubble',
    'theme.list',
    'history.viewEntry'
];
const trModule = await import('../js/modules/translations.js');
const T = trModule.TRANSLATIONS;
const LANGS = ['zh', 'en', 'ja', 'ko'];

for (const key of NEW_KEYS) {
    const values = LANGS.map((l) => key.split('.').reduce((o, k) => o && o[k], T[l]));
    check(
        `新增键 ${key} 四语言齐全`,
        values.every((v) => typeof v === 'string' && v.length > 0)
    );
    check(`新增键 ${key} 四语言取值互不相同`, new Set(values).size === 4, values.join(' / '));
}
check(
    'zh.history.webhookLabel 保持 Webhook（input-safety 钉死）',
    T.zh.history.webhookLabel === 'Webhook'
);
check(
    'translations.js 源码含新增键（防止只改了导入结果）',
    /sectionTitle:/.test(trSrc) && /viewEntry:/.test(trSrc)
);

// ══════════════════════════════════════════════════════════════
// 2. 页面级：DOM 契约 + ⋯ 菜单开合
// ══════════════════════════════════════════════════════════════
console.log('\n[2] 页面级：DOM 契约与 ⋯ 菜单开合');
await seed('/index.html', { appTheme: null });

const domContract = await evalJs(`(() => {
    const q = (id) => document.getElementById(id);
    return JSON.stringify({
        editButtons: !!q('editButtons'),
        editProfile: !!q('editProfile'),
        editButtonsInPanel: !!q('editButtons')?.closest('#morePanel'),
        editProfileInPanel: !!q('editProfile')?.closest('#morePanel'),
        languageToggle: !!q('languageToggle'),
        hasBubbleBtn: document.querySelectorAll('.bubble-container .bubble-btn').length
    });
})()`);
const dc = JSON.parse(domContract);
check('页面内 #editButtons 非 null', dc.editButtons);
check('页面内 #editProfile 非 null', dc.editProfile);
check('#editButtons 已收进 ⋯ 面板', dc.editButtonsInPanel);
check('#editProfile 已收进 ⋯ 面板', dc.editProfileInPanel);
check('#languageToggle 仍在', dc.languageToggle);
check('首页按钮照常渲染', dc.hasBubbleBtn > 0, String(dc.hasBubbleBtn));

const MENU_STATE = `(() => {
    const panel = document.getElementById('morePanel');
    const backdrop = document.getElementById('moreBackdrop');
    const cs = getComputedStyle(panel);
    return JSON.stringify({
        open: panel.classList.contains('show'),
        visibility: cs.visibility,
        top: panel.getBoundingClientRect().top,
        barBottom: document.querySelector('.top-bar').getBoundingClientRect().bottom,
        viewportH: window.innerHeight,
        backdropShown: backdrop ? backdrop.classList.contains('show') : null
    });
})()`;

let ms = JSON.parse(await evalJs(MENU_STATE));
check('⋯ 菜单默认关闭', ms.open === false && ms.visibility === 'hidden');

await evalJs(`document.getElementById('moreToggle').click(); true`);
// 面板有 0.2s 展开过渡（visibility/opacity/transform），量测前等它落定
await sleep(320);
ms = JSON.parse(await evalJs(MENU_STATE));
check('点 ⋯ 后菜单展开', ms.open === true && ms.visibility === 'visible', JSON.stringify(ms));
check('遮罩同时出现', ms.backdropShown === true);
check(
    '面板锚在顶栏下沿（不是底部动作面板）',
    ms.top >= ms.barBottom - 12 && ms.top < ms.viewportH * 0.35,
    `top=${ms.top} barBottom=${ms.barBottom} viewportH=${ms.viewportH}`
);

// 点遮罩关闭
await evalJs(`document.getElementById('moreBackdrop').click(); true`);
await sleep(320);
ms = JSON.parse(await evalJs(MENU_STATE));
check('点遮罩后菜单关闭', ms.open === false && ms.backdropShown === false);

// 隐藏的 #editButtons 仍可点击并打开编辑模态框（DOM 契约的实际用途）
await evalJs(`document.getElementById('moreToggle').click(); true`);
await evalJs(`document.getElementById('editButtons').click(); true`);
const afterEdit = await evalJs(`(() => {
    const m = document.getElementById('buttonEditModal');
    const panel = document.getElementById('morePanel');
    return JSON.stringify({
        modalOpen: m ? m.classList.contains('show') : null,
        panelOpen: panel.classList.contains('show')
    });
})()`);
const ae = JSON.parse(afterEdit);
check('点 #editButtons 仍能打开编辑模态框', ae.modalOpen === true, JSON.stringify(ae));
check('点菜单项后菜单自动关闭（捕获阶段兜底）', ae.panelOpen === false);
await evalJs(`document.getElementById('closeButtonEdit')?.click(); true`);

// ══════════════════════════════════════════════════════════════
// 3. 主题切换：布局令牌真的变
// ══════════════════════════════════════════════════════════════
console.log('\n[3] 主题切换：切到 list 后布局生效');
await seed('/index.html', { appTheme: null });

const LAYOUT = `(() => {
    const btn = document.querySelector('.bubble-container .bubble-btn');
    const title = document.getElementById('title');
    const bar = document.querySelector('.top-bar');
    const container = document.querySelector('.container');
    const b = btn ? getComputedStyle(btn) : null;
    return JSON.stringify({
        attr: document.documentElement.getAttribute('data-theme'),
        radius: b ? b.borderRadius : null,
        justify: b ? b.justifyContent : null,
        iconW: btn ? getComputedStyle(btn.querySelector('.bubble-content i')).width : null,
        titleSize: title ? getComputedStyle(title).fontSize : null,
        barBg: bar ? getComputedStyle(bar).backgroundColor : null,
        containerBg: container ? getComputedStyle(container).backgroundColor : null
    });
})()`;

const bubbleLayout = JSON.parse(await evalJs(LAYOUT));
check('默认主题为 bubble', bubbleLayout.attr === 'bubble', bubbleLayout.attr);

await evalJs(`document.getElementById('moreToggle').click(); true`);
await evalJs(`document.querySelector('#morePanel [data-theme-name="list"]').click(); true`);
const listLayout = JSON.parse(await evalJs(LAYOUT));
check('切到 list 后 data-theme=list', listLayout.attr === 'list', listLayout.attr);
check(
    '切到 list 后按钮圆角变为 14px',
    listLayout.radius === '14px' && bubbleLayout.radius === '10px',
    `${bubbleLayout.radius} -> ${listLayout.radius}`
);
check(
    '切到 list 后按钮内容左对齐',
    listLayout.justify === 'flex-start' && bubbleLayout.justify === 'center',
    `${bubbleLayout.justify} -> ${listLayout.justify}`
);
check(
    '切到 list 后图标底变为 36px',
    listLayout.iconW === '36px' && bubbleLayout.iconW === '30px',
    `${bubbleLayout.iconW} -> ${listLayout.iconW}`
);
check(
    '切到 list 后标题变小（3.2rem -> 2.25rem）',
    listLayout.titleSize !== bubbleLayout.titleSize,
    `${bubbleLayout.titleSize} -> ${listLayout.titleSize}`
);
check(
    '切到 list 后顶栏变白色实底',
    listLayout.barBg !== bubbleLayout.barBg && /rgb\(255, 255, 255\)/.test(listLayout.barBg),
    `${bubbleLayout.barBg} -> ${listLayout.barBg}`
);
check(
    '切到 list 后主卡去掉（背景透明）',
    /rgba\(0, 0, 0, 0\)|transparent/.test(listLayout.containerBg),
    listLayout.containerBg
);

const persisted = await evalJs(`localStorage.getItem('appTheme')`);
check('切换已持久化到 localStorage', persisted === 'list', String(persisted));

// 刷新后保持
await goto(BASE + '/index.html');
const afterReload = JSON.parse(await evalJs(LAYOUT));
check('刷新后仍是 list 主题', afterReload.attr === 'list', afterReload.attr);
check('刷新后布局仍是列表', afterReload.radius === '14px', afterReload.radius);

// 菜单勾选同步
await evalJs(`document.getElementById('moreToggle').click(); true`);
const activeItem = await evalJs(
    `document.querySelector('#morePanel .more-item.active')?.dataset.themeName ?? null`
);
check('⋯ 菜单勾在当前主题项上', activeItem === 'list', String(activeItem));

// 切回 bubble
await evalJs(`document.querySelector('#morePanel [data-theme-name="bubble"]').click(); true`);
const backLayout = JSON.parse(await evalJs(LAYOUT));
check('切回 bubble 后 data-theme=bubble', backLayout.attr === 'bubble', backLayout.attr);
check('切回 bubble 后布局恢复', backLayout.radius === '10px', backLayout.radius);
check('切回 bubble 后图标底恢复 30px', backLayout.iconW === '30px', backLayout.iconW);
check(
    '切回 bubble 后顶栏恢复玻璃',
    backLayout.barBg === bubbleLayout.barBg,
    `${bubbleLayout.barBg} -> ${backLayout.barBg}`
);

// ══════════════════════════════════════════════════════════════
// 4. 历史入口：首页内切换视图，URL 不变
// ══════════════════════════════════════════════════════════════
console.log('\n[4] 历史入口：首页内切换视图，不跳转');
await seed('/index.html', { appTheme: null });

const urlBefore = await evalJs(`location.pathname + location.search`);
const viewState = `(() => {
    const home = document.getElementById('homeView');
    const view = document.getElementById('homeHistoryView');
    const list = document.getElementById('homeHistoryList');
    return JSON.stringify({
        homeHidden: home ? home.hidden : null,
        viewHidden: view ? view.hidden : null,
        listDisplay: list ? getComputedStyle(list).display : null,
        rendered: list ? list.children.length : -1
    });
})()`;

let vs = JSON.parse(await evalJs(viewState));
check('初始：主视图可见、历史视图隐藏', vs.homeHidden === false && vs.viewHidden === true);

await evalJs(`document.getElementById('historyEntry').click(); true`);
vs = JSON.parse(await evalJs(viewState));
const urlAfter = await evalJs(`location.pathname + location.search`);
check(
    '点入口后历史视图显示',
    vs.viewHidden === false && vs.homeHidden === true,
    JSON.stringify(vs)
);
check('点入口后历史列表已渲染', vs.listDisplay !== 'none' && vs.rendered >= 0, JSON.stringify(vs));
check('URL 未变（不跳转）', urlBefore === urlAfter, `${urlBefore} -> ${urlAfter}`);
check('URL 仍指向首页', /index\.html|\/$/.test(urlAfter), urlAfter);

await evalJs(`document.getElementById('homeHistoryBack').click(); true`);
vs = JSON.parse(await evalJs(viewState));
check('点返回后切回主视图', vs.homeHidden === false && vs.viewHidden === true, JSON.stringify(vs));

// 有记录时能渲染出条目
await seed('/index.html', {
    notificationHistory: JSON.stringify([
        {
            nickname: '甲',
            emoji: '🐶',
            message: '快上线',
            timestamp: Date.now(),
            _status: 'success'
        },
        {
            nickname: '乙',
            emoji: '🐱',
            message: '补护盾',
            timestamp: Date.now() - 60000,
            _status: 'error',
            webhook: 'https://example.com/hook'
        }
    ])
});
await evalJs(`document.getElementById('historyEntry').click(); true`);
const items = await evalJs(`document.querySelectorAll('#homeHistoryList .history-item').length`);
check('内嵌视图渲染出历史条目', items === 2, String(items));
const webhookText = await evalJs(
    `document.querySelector('#homeHistoryList .history-error')?.textContent ?? null`
);
check(
    '内嵌视图沿用 zh 的 Webhook 标签',
    typeof webhookText === 'string' && webhookText.startsWith('Webhook'),
    String(webhookText)
);

// ══════════════════════════════════════════════════════════════
// 5. 4 语言：切换语言后菜单与入口文案跟随
// ══════════════════════════════════════════════════════════════
console.log('\n[5] 4 语言：切换语言后文案跟随');
await seed('/index.html', { appTheme: null, appLanguage: 'zh' });

const readTexts = `(() => {
    const txt = (id) => document.getElementById(id)?.textContent?.trim() ?? null;
    const label = (name) => document.querySelector('#morePanel [data-theme-name="' + name + '"] .more-item-label')?.textContent?.trim() ?? null;
    return JSON.stringify({
        entry: txt('historyEntry'),
        themeLabel: txt('moreThemeLabel'),
        bubble: label('bubble'),
        list: label('list'),
        editProfile: document.querySelector('#editProfile .more-item-label')?.textContent?.trim() ?? null
    });
})()`;

const zhTexts = JSON.parse(await evalJs(readTexts));
check('zh 入口文案 = 查看通知历史', zhTexts.entry === '查看通知历史', String(zhTexts.entry));
check('zh 主题分区 = 主题', zhTexts.themeLabel === '主题', String(zhTexts.themeLabel));
check('zh bubble = 气泡列表', zhTexts.bubble === '气泡列表', String(zhTexts.bubble));
check('zh list = 按钮列表', zhTexts.list === '按钮列表', String(zhTexts.list));

for (const lang of ['en', 'ja', 'ko']) {
    await seed('/index.html', { appTheme: null, appLanguage: lang });
    const t = JSON.parse(await evalJs(readTexts));
    const expect = T[lang];
    check(
        `${lang} 入口文案 = ${expect.history.viewEntry}`,
        t.entry === expect.history.viewEntry,
        String(t.entry)
    );
    check(
        `${lang} bubble = ${expect.theme.bubble}`,
        t.bubble === expect.theme.bubble,
        String(t.bubble)
    );
    check(`${lang} list = ${expect.theme.list}`, t.list === expect.theme.list, String(t.list));
    check(
        `${lang} 编辑资料文案跟随`,
        t.editProfile === expect.profile.editTitle,
        String(t.editProfile)
    );
}

// ══════════════════════════════════════════════════════════════
// 6. history.html 未被破坏（顶栏共用 .top-bar）
// ══════════════════════════════════════════════════════════════
console.log('\n[6] history.html 仍正常');
await seed('/history.html', { appTheme: 'list' });
const histPage = await evalJs(`(() => {
    return JSON.stringify({
        attr: document.documentElement.getAttribute('data-theme'),
        items: document.querySelectorAll('#historyList .history-item, #historyList .empty-state').length,
        back: !!document.getElementById('historyBack'),
        clear: !!document.getElementById('clearHistory')
    });
})()`);
const hp = JSON.parse(histPage);
check('history.html 主题同步为 list', hp.attr === 'list', hp.attr);
check('history.html 渲染出空状态/条目', hp.items >= 1, String(hp.items));
check('history.html 返回/清除按钮仍在', hp.back && hp.clear);

// ══════════════════════════════════════════════════════════════
console.log('\n[7] 页面错误检查');
const uniqErr = [...new Set(pageErrors)].filter(
    (e) => !/Failed to load resource|net::ERR|favicon/i.test(String(e))
);
check('页面无 console.error / 未捕获异常', uniqErr.length === 0, uniqErr.slice(0, 3).join(' | '));

console.log(`\n断言：${pass} passed, ${fail} failed`);
if (failedItems.length) {
    console.log('失败项：');
    failedItems.forEach((f) => console.log('  - ' + f));
}
if (uniqErr.length) {
    console.log('页面错误：');
    uniqErr.forEach((e) => console.log('  - ' + e));
}

ws.close();
try {
    chromeProc.kill();
} catch {
    /* ignore */
}
try {
    staticServer?.close();
} catch {
    /* ignore */
}
process.exit(fail === 0 ? 0 : 1);
