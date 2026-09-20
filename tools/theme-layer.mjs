// S2 主题层（data-theme + 持久化 + 防闪）回归脚本（可复现）
//
// 运行方式：
//   node tools/theme-layer.mjs
//
// 目标（对应 docs/TASK_CARDS.md 的 S2 ACCEPTANCE CRITERIA）：
//   1. `<html>` 有 data-theme，值来自 localStorage.appTheme
//   2. 防闪：<head> 内联脚本在 CSS link 之前写入属性
//   3. 非法 / 损坏值一律回退默认主题不崩（纯字符串 + JSON 两种存储形式都覆盖）
//   4. setTheme 持久化，刷新后保持；history.html 与首页一致
//   5. 单一来源：主题名与合法列表只在 config.js 定义
//
// 观测方式（不在生产代码里留测试钩子）：
//   - 预置 LocalStorage + 重新加载页面，走真实 main.js / history.js → theme.init() 路径
//   - 页面内 `await import('/js/modules/theme.js')` 取到应用同一 ESM 实例，
//     直接调 setTheme / getTheme
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

const SERVE_PORT = Number(process.env.THEMELAYER_PORT || 8899);
const EXTERNAL = process.env.THEMELAYER_NO_SERVER === '1';
const BASE = process.env.THEMELAYER_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.THEMELAYER_CDP_PORT || 9451);
// Chrome 路径解析统一到 tools/chrome-path.mjs（CM-009）
const CHROME = resolveChrome(process.env.THEMELAYER_CHROME);

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

const PROFILE = path.join(os.tmpdir(), 's2-theme-layer-profile');
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

console.log('=== S2 主题层回归 ===\n');

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
    await new Promise((r) => setTimeout(r, 300));
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

// ── 快照：读 DOM 属性 + 应用内同一 ESM 实例的 state / CONFIG ──
const SNAP = `(async () => {
    const { state } = await import('/js/modules/state.js');
    const { CONFIG } = await import('/js/modules/config.js');
    const { theme } = await import('/js/modules/theme.js');
    return JSON.stringify({
        attr: document.documentElement.getAttribute('data-theme'),
        dataset: document.documentElement.dataset.theme,
        stateTheme: state.appTheme,
        getTheme: theme.getTheme(),
        stored: localStorage.getItem('appTheme'),
        cfgDefault: CONFIG.themes && CONFIG.themes.default,
        cfgValid: CONFIG.themes && CONFIG.themes.valid,
        cfgKey: CONFIG.themes && CONFIG.themes.storageKey
    });
})()`;

async function snap() {
    try {
        return JSON.parse(await evalJs(SNAP));
    } catch (e) {
        return { error: String(e.message || e) };
    }
}

/** 预置 LocalStorage 后加载指定页面（走真实 init 路径）。 */
async function seed(page, entries = {}) {
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
// 1. 源码级：配置单一来源 + 防闪脚本位置
// ══════════════════════════════════════════════════════════════
console.log('[1] 源码级：配置单一来源与防闪脚本位置');

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const configSrc = read('js/modules/config.js');
const themeSrc = read('js/modules/theme.js');
const stateSrc = read('js/modules/state.js');
const mainSrc = read('js/main.js');
const historySrc = read('js/modules/history.js');
const indexHtml = read('index.html');
const historyHtml = read('history.html');

check('config.js 定义 themes.default', /default:\s*'bubble'/.test(configSrc));
check(
    'config.js 定义 themes.valid 含 bubble 与 list',
    /valid:\s*\[\s*'bubble',\s*'list'\s*\]/.test(configSrc)
);
check('config.js 定义 themes.storageKey', /storageKey:\s*'appTheme'/.test(configSrc));
check(
    'theme.js 导出 init / setTheme / getTheme',
    /init\s*\(\s*\)/.test(themeSrc) &&
        /setTheme\s*\(/.test(themeSrc) &&
        /getTheme\s*\(/.test(themeSrc)
);
check('state.js 声明 appTheme 字段', /appTheme:/.test(stateSrc));
check('main.js 调用 theme.init()', /theme\.init\(\)/.test(mainSrc));
check('history.js 调用 theme.init()', /theme\.init\(\)/.test(historySrc));

// 单一来源：除了 config.js，其他 js 不得再硬编码主题名。
// 只看**代码**——注释里出现 `"list"` 之类的举例不算，先剥掉注释再匹配。
const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const jsFiles = [
    'js/main.js',
    'js/modules/theme.js',
    'js/modules/state.js',
    'js/modules/history.js'
];
const offenders = jsFiles.filter((f) => /['"]bubble['"]|['"]list['"]/.test(stripComments(read(f))));
check('主题名不在 config.js 之外重复硬编码', offenders.length === 0, offenders.join(', '));

// 防闪：内联脚本必须出现在 CSS link 之前
for (const [name, html] of [
    ['index.html', indexHtml],
    ['history.html', historyHtml]
]) {
    const scriptIdx = html.indexOf("localStorage.getItem('appTheme')");
    const cssIdx = html.indexOf('index.css');
    check(
        `${name} 的 <head> 含防闪内联脚本`,
        scriptIdx !== -1 && /setAttribute\('data-theme'/.test(html)
    );
    check(
        `${name} 防闪脚本在 index.css 之前`,
        scriptIdx !== -1 && cssIdx !== -1 && scriptIdx < cssIdx,
        `script=${scriptIdx} css=${cssIdx}`
    );
}

console.log('');

// ══════════════════════════════════════════════════════════════
// 2. 首页：默认 / 合法 / 非法 / 损坏 的读取行为
// ══════════════════════════════════════════════════════════════
console.log('[2] 首页 index.html：读取与回退');

// 先落到站点域下：about:blank 上访问 localStorage 会被拒（SecurityError）
await goto(BASE + '/index.html');

await seed('/index.html', { appTheme: null });
let s = await snap();
check('无 appTheme → data-theme = bubble', s.attr === 'bubble', JSON.stringify(s));
check('无 appTheme → state.appTheme = bubble', s.stateTheme === 'bubble');
check('data-theme 属性与 dataset 一致', s.attr === s.dataset);
check('属性非空（防闪脚本或 init 已写入）', s.attr !== null);

await seed('/index.html', { appTheme: 'list' });
s = await snap();
check('appTheme=list → data-theme = list', s.attr === 'list', JSON.stringify(s));
check('appTheme=list → state.appTheme = list', s.stateTheme === 'list');
check('appTheme=list → getTheme() = list', s.getTheme === 'list');

await seed('/index.html', { appTheme: 'nonexistent' });
s = await snap();
check('非法主题名 nonexistent → 回退 bubble', s.attr === 'bubble', JSON.stringify(s));
check('非法主题名 → state.appTheme 同步为 bubble', s.stateTheme === 'bubble');

await seed('/index.html', { appTheme: '{' });
s = await snap();
check('损坏 JSON "{" → 回退 bubble 不崩', s.attr === 'bubble', JSON.stringify(s));

await seed('/index.html', { appTheme: '{"a":1}' });
s = await snap();
check('JSON 对象（非字符串）→ 回退 bubble', s.attr === 'bubble', JSON.stringify(s));

await seed('/index.html', { appTheme: '"list"' });
s = await snap();
check('JSON 字符串形式 "list" → 识别为 list', s.attr === 'list', JSON.stringify(s));

console.log('');

// ══════════════════════════════════════════════════════════════
// 3. 首页：setTheme 的持久化
// ══════════════════════════════════════════════════════════════
console.log('[3] 首页 index.html：setTheme 持久化');

await seed('/index.html', { appTheme: null });
let ret = await evalJs(`(async () => {
    const { theme } = await import('/js/modules/theme.js');
    return JSON.stringify({
        ret: theme.setTheme('list'),
        attr: document.documentElement.getAttribute('data-theme'),
        stored: localStorage.getItem('appTheme')
    });
})()`);
let r = JSON.parse(ret);
check('setTheme("list") 返回 list', r.ret === 'list', JSON.stringify(r));
check('setTheme("list") → data-theme = list', r.attr === 'list');
check('setTheme("list") → 写入 localStorage（纯字符串）', r.stored === 'list');

// 刷新后保持
await goto(BASE + '/index.html');
s = await snap();
check('刷新后 data-theme 保持 list', s.attr === 'list', JSON.stringify(s));
check('刷新后 state.appTheme 保持 list', s.stateTheme === 'list');

ret = await evalJs(`(async () => {
    const { theme } = await import('/js/modules/theme.js');
    return JSON.stringify({
        ret: theme.setTheme('bogus'),
        attr: document.documentElement.getAttribute('data-theme'),
        stored: localStorage.getItem('appTheme')
    });
})()`);
r = JSON.parse(ret);
check('setTheme("bogus") 回退 bubble', r.ret === 'bubble', JSON.stringify(r));
check('setTheme("bogus") → data-theme = bubble', r.attr === 'bubble');
check('setTheme("bogus") → 持久化 bubble', r.stored === 'bubble');

await goto(BASE + '/index.html');
s = await snap();
check('非法 setTheme 刷新后仍为 bubble', s.attr === 'bubble', JSON.stringify(s));

console.log('');

// ══════════════════════════════════════════════════════════════
// 4. history.html：与首页一致
// ══════════════════════════════════════════════════════════════
console.log('[4] 历史页 history.html：与首页一致');

await seed('/history.html', { appTheme: null });
s = await snap();
check('history 无 appTheme → data-theme = bubble', s.attr === 'bubble', JSON.stringify(s));
check('history state.appTheme = bubble', s.stateTheme === 'bubble');

await seed('/history.html', { appTheme: 'list' });
s = await snap();
check('history appTheme=list → data-theme = list', s.attr === 'list', JSON.stringify(s));
check('history state.appTheme = list', s.stateTheme === 'list');

await seed('/history.html', { appTheme: 'nonexistent' });
s = await snap();
check('history 非法值 → 回退 bubble', s.attr === 'bubble', JSON.stringify(s));

// 首页切到 list 后，历史页应读到同一值
await seed('/index.html', { appTheme: null });
await evalJs(`(async () => {
    const { theme } = await import('/js/modules/theme.js');
    theme.setTheme('list');
    return true;
})()`);
await goto(BASE + '/history.html');
s = await snap();
check('首页切换到 list 后，history 页读到 list', s.attr === 'list', JSON.stringify(s));

console.log('');

// ══════════════════════════════════════════════════════════════
// 5. 页面无异常
// ══════════════════════════════════════════════════════════════
console.log('[5] 页面错误检查');
const uniqErr = [...new Set(pageErrors)].filter(
    (e) => !/Failed to load resource|net::ERR/i.test(String(e))
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
