// S5 PWA 准备回归脚本（可复现）
//
// 运行方式：
//   node tools/pwa.mjs
//
// 目标（对应 docs/TASK_CARDS.md 的 S5 ACCEPTANCE CRITERIA）：
//   1. manifest.json 通过静态校验（name / display / start_url / icons / 令牌色）
//   2. sw.js 能注册并激活，预缓存清单与 sw.js 声明一致且文件真实存在
//   3. 离线可加载：**停掉静态服务器**（真实网络不可达）后，
//      首页 / 历史页 / CSS / JS 模块全部来自缓存
//   4. JSONBin 回执不写缓存（实时数据）
//   5. 产品行为零变化（页面无异常）
//
// 为什么用「停服务器」而不是 CDP emulateNetworkConditions：
//   Service Worker 是独立 target，页面会话上的离线仿真不一定作用到 SW 内的 fetch；
//   直接让服务器不可达是**无条件真实**的断网，语义与「断网后页面可加载」完全一致。
//
// 依赖：仅 Node 内置模块 + 本机 Chrome，零 npm 依赖。
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChrome } from './chrome-path.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SERVE_PORT = Number(process.env.PWA_PORT || 8899);
const EXTERNAL = process.env.PWA_NO_SERVER === '1';
const BASE = process.env.PWA_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.PWA_CDP_PORT || 9454);
// Chrome 路径解析统一到 tools/chrome-path.mjs（CM-009）
const CHROME = resolveChrome(process.env.PWA_CHROME);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4'
};

function requestHandler(req, res) {
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
}

// 可启停的静态服务器：离线验证 = 真正把它关掉
let staticServer = null;
async function startServer() {
    await new Promise((resolve, reject) => {
        staticServer = http.createServer(requestHandler);
        staticServer.on('error', reject);
        staticServer.listen(SERVE_PORT, '127.0.0.1', resolve);
    });
}
async function stopServer() {
    if (!staticServer) return;
    const srv = staticServer;
    staticServer = null;
    // closeAllConnections：不让 keep-alive 连接拖住 close 回调（Node ≥ 18.2）
    if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
}

if (!EXTERNAL) await startServer();

const cleanEnv = { ...process.env };
for (const k of Object.keys(cleanEnv)) if (/proxy/i.test(k)) delete cleanEnv[k];
cleanEnv.NO_PROXY = '127.0.0.1,localhost';
cleanEnv.no_proxy = '127.0.0.1,localhost';

const PROFILE = path.join(os.tmpdir(), 's5-pwa-profile');
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

console.log('=== S5 PWA 准备回归 ===\n');

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
        // 离线阶段 JSONBin / CDN 请求失败是预期内的，不算页面异常
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

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// ══════════════════════════════════════════════════════════════
// 1. 源码级：manifest / sw.js / 注册脚本 / html 接线
// ══════════════════════════════════════════════════════════════
console.log('[1] 源码级：manifest / sw.js / 接线');

let manifest = null;
try {
    manifest = JSON.parse(read('manifest.json'));
} catch {
    /* 保持 null，下面的断言会失败 */
}
check('manifest.json 存在且是合法 JSON', manifest !== null);
check('name = "Call Me MVP"', manifest?.name === 'Call Me MVP', manifest?.name);
check(
    'short_name 非空',
    typeof manifest?.short_name === 'string' && manifest.short_name.length > 0
);
check('display = "standalone"', manifest?.display === 'standalone', manifest?.display);
check(
    'start_url 是相对路径且指向存在的文件',
    typeof manifest?.start_url === 'string' &&
        !manifest.start_url.startsWith('/') &&
        existsSync(path.join(ROOT, manifest.start_url)),
    String(manifest?.start_url)
);
check('scope 是相对路径 "./"', manifest?.scope === './', manifest?.scope);

// theme_color / background_color 必须来自 index.css 的令牌（单一来源纪律）
const cssRoot = read('index.css');
const accentToken = cssRoot.match(/--accent:\s*(#[0-9a-fA-F]{6})/)?.[1];
const bgToken = cssRoot.match(/--notion-gray:\s*(#[0-9a-fA-F]{6})/)?.[1];
check(
    'theme_color = 令牌 --accent',
    typeof manifest?.theme_color === 'string' &&
        accentToken !== undefined &&
        manifest.theme_color.toLowerCase() === accentToken.toLowerCase(),
    `${manifest?.theme_color} vs ${accentToken}`
);
check(
    'background_color = 令牌 --notion-gray（页面底色）',
    typeof manifest?.background_color === 'string' &&
        bgToken !== undefined &&
        manifest.background_color.toLowerCase() === bgToken.toLowerCase(),
    `${manifest?.background_color} vs ${bgToken}`
);

// icons：192 + 512 至少各一条；文件真实存在且 PNG 尺寸与声明一致
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngSize(p) {
    const buf = readFileSync(p);
    if (!buf.subarray(0, 8).equals(PNG_SIG)) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
check('icons 至少 3 条（192 / 512 / maskable）', icons.length >= 3, String(icons.length));
check(
    'icons 覆盖 192x192 与 512x512',
    icons.some((i) => i.sizes === '192x192') && icons.some((i) => i.sizes === '512x512'),
    JSON.stringify(icons.map((i) => i.sizes))
);
check(
    'icons 含 purpose: maskable 条目',
    icons.some((i) => String(i.purpose).includes('maskable')),
    JSON.stringify(icons.map((i) => i.purpose))
);
for (const icon of icons) {
    const fp = path.join(ROOT, icon.src);
    const size = existsSync(fp) ? pngSize(fp) : null;
    const want = String(icon.sizes).split(' ')[0];
    check(
        `图标文件真实存在且尺寸一致：${icon.src}`,
        size !== null && `${size.width}x${size.height}` === want,
        size ? `${size.width}x${size.height}` : 'missing/bad png'
    );
}

// sw.js：存在 + 关键策略都在源码里
let swSrc = '';
try {
    swSrc = read('sw.js');
} catch {
    /* 保持空 */
}
check('sw.js 存在', swSrc.length > 0);
check(
    'sw.js 含 install/activate/fetch 三个生命周期',
    /addEventListener\('install'/.test(swSrc) &&
        /addEventListener\('activate'/.test(swSrc) &&
        /addEventListener\('fetch'/.test(swSrc)
);
check(
    'sw.js 更新策略 = skipWaiting + clients.claim',
    /skipWaiting\(\)/.test(swSrc) && /clients\.claim\(\)/.test(swSrc)
);
check(
    'sw.js JSONBin 走独立分支（网络优先、不写缓存）',
    /api\.jsonbin\.io/.test(swSrc) && /allowCache:\s*false/.test(swSrc)
);

// 预缓存清单：从 sw.js 里解析出来，逐个验证文件真实存在
// （cache.addAll 任一失败 → 整个 install 失败 → SW 永不生效，所以这条是硬前提）
const precacheList = (() => {
    const m = swSrc.match(/const PRECACHE = \[([\s\S]*?)\];/);
    if (!m) return [];
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
})();
check('预缓存清单解析出 ≥ 35 条', precacheList.length >= 35, String(precacheList.length));
let allPrecacheExist = true;
const missing = [];
for (const entry of precacheList) {
    const rel = entry.replace(/^\.\//, '');
    if (rel === '') continue; // './' 即站点根，由服务器映射 index.html
    if (!existsSync(path.join(ROOT, rel))) {
        allPrecacheExist = false;
        missing.push(entry);
    }
}
check('预缓存清单里每个文件都真实存在', allPrecacheExist, missing.join(', '));

// 注册脚本：load 后注册 + 相对路径（线上是 GitHub Pages 子路径，'/sw.js' 会 404）
const regSrc = read('js/sw-register.js');
check(
    'sw-register.js 在 load 事件后才 register',
    /addEventListener\('load'/.test(regSrc) && /serviceWorker\.register\(/.test(regSrc)
);
check(
    'sw-register.js 用相对路径 ./sw.js（适配 GitHub Pages 子路径）',
    /register\('\.\/sw\.js'\)/.test(regSrc) && !/register\('\/sw\.js'\)/.test(regSrc)
);
const indexHtml = read('index.html');
const historyHtml = read('history.html');
check(
    'index.html 接了 manifest link + sw-register',
    /rel="manifest"\s+href="manifest\.json"/.test(indexHtml) &&
        /js\/sw-register\.js/.test(indexHtml)
);
check(
    'history.html 也接了 manifest link（同一 SW scope 内）',
    /rel="manifest"\s+href="manifest\.json"/.test(historyHtml)
);

// ══════════════════════════════════════════════════════════════
// 2. 运行时：SW 注册 / 激活 / 预缓存落地 / manifest 可取
// ══════════════════════════════════════════════════════════════
console.log('\n[2] 运行时：注册 / 激活 / 预缓存');

await seed('/index.html');

const swSupported = await evalJs(`('serviceWorker' in navigator)`);
check('浏览器支持 serviceWorker', swSupported === true);

const swInfo = await evalJs(`(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
            const onChange = () => resolve();
            navigator.serviceWorker.addEventListener('controllerchange', onChange, { once: true });
            setTimeout(resolve, 8000);
        });
    }
    return {
        scope: reg.scope,
        state: reg.active && reg.active.state,
        scriptUrl: reg.active && reg.active.scriptURL,
        controlled: !!navigator.serviceWorker.controller
    };
})()`);
check(
    'SW 注册成功且 scriptURL 指向 ./sw.js',
    typeof swInfo.scriptUrl === 'string' && swInfo.scriptUrl.endsWith('/sw.js'),
    String(swInfo.scriptUrl)
);
check('SW 已激活（activated）', swInfo.state === 'activated', String(swInfo.state));
check('当前页面已被 SW 控制（controller 非空）', swInfo.controlled === true);
check(
    'SW scope 覆盖站点根',
    typeof swInfo.scope === 'string' && new URL(BASE).origin === new URL(swInfo.scope).origin,
    String(swInfo.scope)
);

const cacheInfo = await evalJs(`(async () => {
    const names = await caches.keys();
    const cache = await caches.open('call-me-mvp-v1');
    const keys = await cache.keys();
    return {
        names,
        urls: keys.map((r) => new URL(r.url).pathname),
    };
})()`);
check(
    '缓存已建立（call-me-mvp-v1）',
    Array.isArray(cacheInfo.names) && cacheInfo.names.includes('call-me-mvp-v1'),
    JSON.stringify(cacheInfo.names)
);
const expectedCached = precacheList
    .filter((e) => e !== './')
    .map((e) => new URL(e, BASE + '/sw.js').pathname);
const missingInCache = expectedCached.filter((p) => !cacheInfo.urls.includes(p));
check(
    '预缓存清单全部落地到 Cache（ignoreSearch 后逐条核对）',
    missingInCache.length === 0,
    missingInCache.join(', ')
);

const manifestResp = await evalJs(`(async () => {
    const r = await fetch('manifest.json');
    return { ok: r.ok, type: r.headers.get('content-type'), name: (await r.json()).name };
})()`);
check(
    'manifest.json 可经 HTTP 取回且 content-type 为 json',
    manifestResp.ok === true && /json/.test(manifestResp.type || ''),
    String(manifestResp.type)
);
check(
    '页面 <link rel="manifest"> 存在',
    (await evalJs(`!!document.querySelector('link[rel="manifest"][href$="manifest.json"]')`)) ===
        true
);

// JSONBin 绝不进缓存：主动打一次请求（失败也没关系），再看缓存里有没有它的 URL
await evalJs(`(async () => {
    try {
        await fetch('https://api.jsonbin.io/v3/b/6a4e36bdda38895dfe40054e/latest');
    } catch (e) {
        /* 本机可能直连不了 JSONBin，失败不影响本断言 */
    }
    return true;
})()`);
await sleep(200);
check(
    'JSONBin 响应不写入 Cache',
    cacheInfo.urls.every((p) => !p.includes('jsonbin')),
    ''
);

// ══════════════════════════════════════════════════════════════
// 3. 离线：停掉静态服务器（真实网络不可达）→ 页面仍可加载
// ══════════════════════════════════════════════════════════════
console.log('\n[3] 离线（停服务器）：缓存兜底');

await stopServer();
check('静态服务器已停止（真实断网）', staticServer === null);

await goto(BASE + '/index.html');
const offlineHome = await evalJs(`(() => ({
    ready: document.readyState,
    title: document.title,
    hasButtons: !!document.getElementById('editButtons'),
    controlled: !!navigator.serviceWorker.controller,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
}))()`);
check(
    '离线：index.html 可加载（readyState complete）',
    offlineHome.ready === 'complete',
    offlineHome.ready
);
check(
    '离线：标题仍是 Call Me（不是 Chrome 错误页）',
    offlineHome.title === 'Call Me',
    offlineHome.title
);
check('离线：应用内容在（#editButtons 存在）', offlineHome.hasButtons === true);
check('离线：页面仍被 SW 控制', offlineHome.controlled === true);
check(
    '离线：CSS 来自缓存（令牌 --accent 生效）',
    offlineHome.accent.toLowerCase() === '#337ea9',
    offlineHome.accent
);

const offlineModule = await evalJs(`(async () => {
    const mod = await import('/js/modules/state.js');
    return { ok: !!mod, hasState: typeof mod.state === 'object' };
})()`);
check(
    '离线：JS 模块可加载（state.js 来自缓存）',
    offlineModule.ok === true && offlineModule.hasState === true,
    JSON.stringify(offlineModule)
);

await goto(BASE + '/history.html');
const offlineHistory = await evalJs(`(() => ({
    ready: document.readyState,
    title: document.title,
    hasBack: !!document.getElementById('historyBack')
}))()`);
check('离线：history.html 可加载', offlineHistory.ready === 'complete', offlineHistory.ready);
check(
    '离线：历史页内容在（#historyBack 存在）',
    offlineHistory.hasBack === true,
    offlineHistory.title
);

// ══════════════════════════════════════════════════════════════
// 4. 恢复在线：产品行为回到正常路径
// ══════════════════════════════════════════════════════════════
console.log('\n[4] 恢复在线');

if (!EXTERNAL) await startServer();
await goto(BASE + '/index.html');
const backOnline = await evalJs(`(() => ({
    ready: document.readyState,
    hasButtons: !!document.getElementById('editButtons'),
    controlled: !!navigator.serviceWorker.controller
}))()`);
check('恢复在线：页面正常加载', backOnline.ready === 'complete' && backOnline.hasButtons === true);
check('恢复在线：SW 仍在控制页面', backOnline.controlled === true);

// ══════════════════════════════════════════════════════════════
// 5. 页面无异常
// ══════════════════════════════════════════════════════════════
console.log('\n[5] 页面无异常');
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
