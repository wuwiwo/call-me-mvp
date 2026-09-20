// UI-15 版式回归脚本（可复现）
//
// 运行方式：
//   node tools/ui-layout.mjs
//
// 目标（对应 docs/AI_HANDOFF.md 的 UI-15 四条）：
//   1. 「简约模式 - 首页每行 2 个按钮」在**两个主题**下都成立且同排等高
//   2. 「点击可切换布局」气泡为常驻样式（不靠 hover），点页面任意区域才关闭
//   3. 历史记录右上角三态 tag 不再压住同一行的日期（≥601px）
//   4. 首页核心内容顶部对齐：距顶栏恒定 48px（不随按钮数量 / 视口高度漂移）
//
// 为什么单独一个套件：这四条横跨首页排布、历史页、编辑模态框，
// 塞进任一套件的既有主题都会让那个套件失去焦点。
//
// 观测方式（不在生产代码里留测试钩子）：
//   - 预置 LocalStorage + 重新加载 → 走真实 main.js / history.js 初始化路径
//   - 布局量测全部用 getBoundingClientRect（真实渲染结果，不看 CSS 源码断言）
//   - 「点页面任意区域关闭」用 CDP Input.dispatchMouseEvent 发**真实坐标**事件，
//     不用 el.click()（项目已知教训：程序化 click 不做命中测试，验不出遮挡）
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

const SERVE_PORT = Number(process.env.UILAYOUT_PORT || 8899);
const EXTERNAL = process.env.UILAYOUT_NO_SERVER === '1';
const BASE = process.env.UILAYOUT_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.UILAYOUT_CDP_PORT || 9455);
// Chrome 路径解析统一到 tools/chrome-path.mjs（CM-009）
const CHROME = resolveChrome(process.env.UILAYOUT_CHROME);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4'
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

const PROFILE = path.join(os.tmpdir(), 'ui-layout-profile');
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

console.log('=== UI-15 版式回归 ===\n');

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

async function setViewport(w, h) {
    await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: w, height: h, deviceScaleFactor: 1, mobile: false },
        S
    );
}

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
    if (!page.startsWith('http')) await goto(BASE + '/index.html');
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

/** 真实坐标鼠标点击（走浏览器命中测试，不是 el.click()）。 */
async function realClickAt(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send(
            'Input.dispatchMouseEvent',
            { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 },
            S
        );
    }
}

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// 4 个按钮：既能验「每行 2 个」，也能验第二行确实换了行
const FOUR_BUTTONS = JSON.stringify({
    buttons: [
        { id: 'quick_online', message: '呼叫 R4/5（Call R4/5）', icon: 'bolt' },
        { id: 'emergency', message: '堡垒要塞', icon: 'exclamation-triangle' },
        { id: 'custom_1', message: '补护盾', icon: 'shield-alt' },
        { id: 'custom_2', message: '领奖品', icon: 'gift' }
    ],
    activeGroup: 'default'
});

// ══════════════════════════════════════════════════════════════
// 1. 源码级：主题不得吞掉「每行几个」的语义
// ══════════════════════════════════════════════════════════════
console.log('[1] 源码级：显示模式由用户决定，主题不覆盖');

const indexCss = read('index.css');
const historyCss = read('history.css');
const indexHtml = read('index.html');

// list 主题里任何把 minimal 模式压回单列的写法都会让本套件 [2] 变红，
// 这条源码断言负责指出"是谁改的"。
check(
    'index.css 不再有「list 主题强制单列」的 minimal 覆盖块',
    !/\[data-theme='list'\]\s*\.bubble-container\.minimal-mode\s*\{[\s\S]*?flex-direction:\s*column/.test(
        indexCss
    )
);
check(
    '.bubble-container.minimal-mode 仍是 2 列网格',
    /\.bubble-container\.minimal-mode\s*\{[\s\S]*?repeat\(2,\s*1fr\)/.test(indexCss)
);
check('index.html 的 <body> 带 .home-page', /<body class="home-page">/.test(indexHtml));
check(
    'index.css 的顶部留白走 --topbar-h + --content-top-gap 令牌',
    /padding-top:\s*calc\(var\(--topbar-h\)\s*\+\s*var\(--content-top-gap\)\)/.test(indexCss)
);
check(
    'history.css 在 ≥601px 用三列网格给 tag 预留位置',
    /@media\s*\(min-width:\s*601px\)[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) auto/.test(
        historyCss
    )
);

// ══════════════════════════════════════════════════════════════
// 2. 简约模式：两个主题都每行 2 个，且同排等高
// ══════════════════════════════════════════════════════════════
console.log('\n[2] 简约模式（每行 2 个）在 bubble / list 下同样生效');

const BTN_GEO = `(() => {
    const btns = [...document.querySelectorAll('.bubble-container .bubble-btn')];
    return JSON.stringify({
        count: btns.length,
        display: btns.length ? getComputedStyle(btns[0].parentElement).display : null,
        rects: btns.map(el => {
            const r = el.getBoundingClientRect();
            return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width) };
        })
    });
})()`;

for (const vp of [
    { w: 1280, h: 900, label: '宽屏 1280' },
    { w: 390, h: 844, label: '窄屏 390' }
]) {
    await setViewport(vp.w, vp.h);
    for (const theme of ['bubble', 'list']) {
        await seed('/index.html', {
            appTheme: theme,
            buttonDisplayMode: 'minimal',
            buttonConfig: FOUR_BUTTONS
        });
        const g = JSON.parse(await evalJs(BTN_GEO));
        const r = g.rects;
        check(`${vp.label} · ${theme}：容器是网格布局`, g.display === 'grid', String(g.display));
        check(
            `${vp.label} · ${theme}：第 1 行两个按钮同排（顶边一致）`,
            r.length >= 2 && Math.abs(r[0].top - r[1].top) <= 1,
            JSON.stringify(r.slice(0, 2))
        );
        check(
            `${vp.label} · ${theme}：第 1 行两个按钮左右分列`,
            r.length >= 2 && r[1].left > r[0].left + 20,
            `${r[0].left} / ${r[1].left}`
        );
        check(
            `${vp.label} · ${theme}：同排等高（底边一致）`,
            r.length >= 2 && Math.abs(r[0].bottom - r[1].bottom) <= 1,
            `${r[0].bottom} / ${r[1].bottom}`
        );
        check(
            `${vp.label} · ${theme}：第 3 个按钮换到下一行`,
            r.length >= 3 && r[2].top > r[0].top + 10,
            `${r[0].top} -> ${r[2].top}`
        );
    }
}

// 默认模式仍是一行一个（防止把 [2] 的修复做成了"永远两列"）
await setViewport(390, 844);
await seed('/index.html', {
    appTheme: 'list',
    buttonDisplayMode: 'default',
    buttonConfig: FOUR_BUTTONS
});
const singleGeo = JSON.parse(await evalJs(BTN_GEO));
check(
    'default 模式仍是一行一个（第 2 个按钮在第 1 个下方）',
    singleGeo.rects.length >= 2 && singleGeo.rects[1].top > singleGeo.rects[0].top + 10,
    JSON.stringify(singleGeo.rects.slice(0, 2))
);

// ══════════════════════════════════════════════════════════════
// 3. 顶部留白：核心内容距顶栏恒定 48px
// ══════════════════════════════════════════════════════════════
console.log('\n[3] 首页内容顶部对齐，距顶栏 48px');

const TOP_GEO = `(() => {
    const bar = document.querySelector('.top-bar');
    const c = document.querySelector('.container');
    const b = bar.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    return JSON.stringify({
        barH: Math.round(b.height),
        barBottom: Math.round(b.bottom),
        containerTop: Math.round(cr.top),
        gap: Math.round(cr.top - b.bottom),
        alignItems: getComputedStyle(document.body).alignItems,
        marginTop: getComputedStyle(c).marginTop
    });
})()`;

for (const vp of [
    { w: 1280, h: 900, barH: 72, label: '宽屏 1280' },
    { w: 480, h: 844, barH: 61, label: '窄屏 480' },
    { w: 320, h: 800, barH: 57, label: '极窄 320' }
]) {
    await setViewport(vp.w, vp.h);
    for (const theme of ['bubble', 'list']) {
        await seed('/index.html', {
            appTheme: theme,
            buttonDisplayMode: 'default',
            buttonConfig: FOUR_BUTTONS
        });
        const t = JSON.parse(await evalJs(TOP_GEO));
        check(
            `${vp.label} · ${theme}：顶栏高度仍是 ${vp.barH}px（令牌没写错）`,
            t.barH === vp.barH,
            String(t.barH)
        );
        check(
            `${vp.label} · ${theme}：容器顶距顶栏 = 48px`,
            Math.abs(t.gap - 48) <= 1,
            String(t.gap)
        );
        check(
            `${vp.label} · ${theme}：body 顶部对齐 + 容器无额外 margin-top`,
            t.alignItems === 'flex-start' && parseFloat(t.marginTop) === 0,
            `${t.alignItems} / ${t.marginTop}`
        );
    }
}

// 内容变多时留白不变（原来因为 body 垂直居中，位置会随内容量漂移）
await setViewport(390, 844);
await seed('/index.html', { appTheme: 'bubble', buttonDisplayMode: 'default' });
const twoBtnTop = JSON.parse(await evalJs(TOP_GEO));
await seed('/index.html', {
    appTheme: 'bubble',
    buttonDisplayMode: 'default',
    buttonConfig: FOUR_BUTTONS
});
const fourBtnTop = JSON.parse(await evalJs(TOP_GEO));
check(
    '按钮从 2 个变 4 个，顶部 48px 留白不变',
    Math.abs(twoBtnTop.containerTop - fourBtnTop.containerTop) <= 1,
    `${twoBtnTop.containerTop} vs ${fourBtnTop.containerTop}`
);

// 历史页仍由 history.css 自己管（不受 [3] 影响）
await seed('/history.html', { appTheme: 'bubble' });
const histTop = JSON.parse(
    await evalJs(`(() => {
    const bar = document.querySelector('.top-bar');
    const c = document.querySelector('.container');
    return JSON.stringify({
        align: getComputedStyle(document.body).alignItems,
        bodyClass: document.body.className,
        gap: Math.round(c.getBoundingClientRect().top - bar.getBoundingClientRect().bottom)
    });
})()`)
);
check(
    '历史页保持自己的顶部留白（body 没有 home-page）',
    !histTop.bodyClass.includes('home-page') && histTop.align === 'flex-start' && histTop.gap > 0,
    JSON.stringify(histTop)
);

// ══════════════════════════════════════════════════════════════
// 4. 历史 tag 不压日期（≥601px）
// ══════════════════════════════════════════════════════════════
console.log('\n[4] 历史记录：三态 tag 与日期不重叠');

const RECORDS = JSON.stringify([
    {
        emoji: '🐶',
        nickname: '阿珍',
        message: '早安 next meeting at ten',
        timestamp: Date.now() - 3600e3,
        _status: 'success',
        receipt: 'read'
    },
    {
        emoji: '🐱',
        nickname: 'Bob with a fairly long name',
        message: '晚安 good night',
        timestamp: Date.now() - 7200e3,
        _status: 'success',
        receipt: 'pending'
    },
    {
        emoji: '🦊',
        nickname: 'Carol',
        message: '失败重试',
        timestamp: Date.now() - 10800e3,
        _status: 'error',
        receipt: 'failed'
    }
]);

const TAG_GEO = `(() => {
    const items = [...document.querySelectorAll('.history-item')];
    return JSON.stringify(items.map(el => {
        const tag = el.querySelector('.history-tag');
        const time = el.querySelector('.history-time');
        const t = tag ? tag.getBoundingClientRect() : null;
        const m = time ? time.getBoundingClientRect() : null;
        return {
            display: getComputedStyle(el).display,
            tagPos: tag ? getComputedStyle(tag).position : null,
            tagText: tag ? tag.textContent : null,
            overlap: t && m ? !(t.right < m.left || t.left > m.right || t.bottom < m.top || t.top > m.bottom) : null,
            // tag 在时间右侧（宽屏）；窄屏纵向流时为 <= 0（tag 在下方）
            tagLeftMinusTimeRight: t && m ? Math.round(t.left - m.right) : null,
            tagTopMinusTimeBottom: t && m ? Math.round(t.top - m.bottom) : null
        };
    }));
})()`;

for (const w of [1000, 601]) {
    for (const lang of ['zh', 'en', 'ja', 'ko']) {
        await setViewport(w, 900);
        await seed('/history.html', { appLanguage: lang, notificationHistory: RECORDS });
        const items = JSON.parse(await evalJs(TAG_GEO));
        check(`${w}px · ${lang}：渲染出 3 条记录`, items.length === 3, String(items.length));
        check(
            `${w}px · ${lang}：卡片改为三列网格且 tag 参与布局（static）`,
            items.every((i) => i.display === 'grid' && i.tagPos === 'static'),
            JSON.stringify(items.map((i) => `${i.display}/${i.tagPos}`))
        );
        check(
            `${w}px · ${lang}：tag 与日期不重叠且排在其右侧`,
            items.every((i) => i.overlap === false && i.tagLeftMinusTimeRight >= 8),
            JSON.stringify(items.map((i) => `${i.overlap}/${i.tagLeftMinusTimeRight}`))
        );
    }
}

// 窄屏维持 UI-14 F2 的纵向流行为（tag 跟在内容后面，不与日期同行）
await setViewport(390, 900);
await seed('/history.html', { notificationHistory: RECORDS });
const narrowItems = JSON.parse(await evalJs(TAG_GEO));
check(
    '390px：仍为纵向 flex + 静态 tag（UI-14 F2 行为不变）',
    narrowItems.every((i) => i.display === 'flex' && i.tagPos === 'static'),
    JSON.stringify(narrowItems.map((i) => `${i.display}/${i.tagPos}`))
);
check(
    '390px：tag 排在日期下方，不与日期相交',
    narrowItems.every((i) => i.overlap === false && i.tagTopMinusTimeBottom > 0),
    JSON.stringify(narrowItems.map((i) => `${i.overlap}/${i.tagTopMinusTimeBottom}`))
);

// ══════════════════════════════════════════════════════════════
// 5. 布局提示气泡：常驻 + 点任意区域关闭
// ══════════════════════════════════════════════════════════════
console.log('\n[5] 「点击可切换布局」气泡：常驻而非 hover');

// ⚠️ getComputedStyle(el, '::after') 返回**活对象**，属性读取时才求值 ——
//    必须在页面内把关心的字段拷成普通值再返回，带回 Node 侧会读到"当时"的值。
const TIP_STATE = `(() => {
    const btn = document.getElementById('toggleMode');
    if (!btn) return JSON.stringify({ missing: true });
    const cs = getComputedStyle(btn, '::after');
    return JSON.stringify({
        opacity: cs.opacity,
        visibility: cs.visibility,
        content: cs.content,
        hasShowClass: btn.classList.contains('tip-show')
    });
})()`;

await setViewport(390, 844);
await seed('/index.html', { appTheme: 'bubble', buttonDisplayMode: 'default' });
const beforeOpen = JSON.parse(await evalJs(TIP_STATE));
check(
    '打开编辑框前气泡不可见',
    beforeOpen.visibility === 'hidden' && beforeOpen.hasShowClass === false,
    JSON.stringify(beforeOpen)
);

await evalJs(`document.getElementById('editButtons').click(); true`);
await sleep(500);
const afterOpen = JSON.parse(await evalJs(TIP_STATE));
check(
    '打开编辑框后气泡立即常显（无需 hover）',
    afterOpen.visibility === 'visible' &&
        afterOpen.opacity === '1' &&
        afterOpen.hasShowClass === true,
    JSON.stringify(afterOpen)
);
check(
    '气泡文案跟随语言（非空、非选择器原文）',
    typeof afterOpen.content === 'string' &&
        afterOpen.content.length > 4 &&
        !afterOpen.content.includes('profile.layoutTip'),
    String(afterOpen.content)
);

// 常驻：3 秒后仍在（旧行为是 2.5s 自动消失）
await sleep(3200);
const afterWait = JSON.parse(await evalJs(TIP_STATE));
check(
    '等 3.2s 后气泡仍在（不是自动消失）',
    afterWait.visibility === 'visible' && afterWait.hasShowClass === true,
    JSON.stringify(afterWait)
);

// 点页面任意区域（真实坐标）→ 关闭
await realClickAt(200, 760);
await sleep(400);
const afterClick = JSON.parse(await evalJs(TIP_STATE));
check(
    '点页面任意区域后气泡关闭',
    afterClick.visibility === 'hidden' && afterClick.hasShowClass === false,
    JSON.stringify(afterClick)
);

// 再次打开应重新常显（不是一次性）
await evalJs(`document.getElementById('closeButtonEdit')?.click(); true`);
await sleep(300);
await evalJs(`document.getElementById('editButtons').click(); true`);
await sleep(500);
const reopened = JSON.parse(await evalJs(TIP_STATE));
check(
    '再次打开编辑框气泡重新常显',
    reopened.visibility === 'visible' && reopened.hasShowClass === true,
    JSON.stringify(reopened)
);

// 键盘按下同样关闭（捕获阶段挂在 window 上）
await cdp.send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    S
);
await cdp.send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    S
);
await sleep(400);
const afterKey = JSON.parse(await evalJs(TIP_STATE));
check(
    '按任意键后气泡关闭',
    afterKey.visibility === 'hidden' && afterKey.hasShowClass === false,
    JSON.stringify(afterKey)
);

// ══════════════════════════════════════════════════════════════
// 6. 页面无异常
// ══════════════════════════════════════════════════════════════
console.log('\n[6] 页面无异常');
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
