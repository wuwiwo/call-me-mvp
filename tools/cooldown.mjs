// CM-006 cooldown 单一责任回归脚本（可复现）
//
// 运行方式：
//   node tools/cooldown.mjs
//
// 目标：验证 cooldown 的状态转换、lastClickTime 持久化与 timer 生命周期
//       都由 countdown（唯一责任者）集中管理，且下列行为保持正确：
//       首次加载 / 刷新恢复 / 归零 / 重复点击 / 请求成功 / 请求失败回滚 /
//       非法时间戳 / 过期 / 未来时间戳 / timer 去重 / 旧 timer 不覆盖新状态。
//
// 观测手段（**不在生产代码里留任何测试钩子**）：
//   1. 页面里用动态 `import('/js/modules/state.js')` 取到应用正在使用的
//      **同一个模块实例**（ESM 模块记录按 URL 缓存），因此可以读到
//      `state.canClick` / `countdown.remaining()` 等真实运行时状态。
//   2. 用 CDP `Page.addScriptToEvaluateOnNewDocument` 在页面脚本之前
//      包装 setInterval / clearInterval / setTimeout，得到
//      「已武装的 interval 数」「是否出现长延时 timeout（旧实现的恢复定时器）」。
//   3. 包装 fetch 以**完全离线**地模拟成功与失败两种 webhook 结果，
//      不产生任何真实外部请求。
//
// 依赖：仅 Node 内置模块（node:http / node:child_process / node:fs）+ 本机 Chrome。
// 不引入任何 npm 依赖。
//
// 本机环境注意（与 e2e.mjs / storage-resilience.mjs 一致）：
//   - HTTP_PROXY 会劫持回环请求 → Chrome 带 --no-proxy-server --proxy-bypass-list=<-loopback>
//   - 探针必须用 node:http 直连，不能用 fetch
//   - 静态服务器必须与浏览器同进程（子进程不能跨 Bash 命令存活）
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChrome } from './chrome-path.mjs';

// 可选：把完整输出落盘，与 CM003_LOG / CM004_LOG / CM005_LOG 的约定一致。
// 在第一条 console.log 之前安装，确保捕获全部输出。
const LOG_PATH = process.env.CM006_LOG || '';
const logLines = [];
{
    const raw = console.log.bind(console);
    console.log = (...a) => {
        const s = a.join(' ');
        logLines.push(s);
        raw(s);
    };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SERVE_PORT = Number(process.env.CM006_PORT || 8899);
const EXTERNAL = process.env.CM006_NO_SERVER === '1';
const BASE = process.env.CM006_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.CM006_CDP_PORT || 9446);
// Chrome 路径解析已统一到 tools/chrome-path.mjs（CM-009）：
// CM006_CHROME > CHROME_PATH > 常见安装位置 > which
const CHROME = resolveChrome(process.env.CM006_CHROME);
const PROFILE = path.join(os.tmpdir(), 'cm006-cooldown-profile');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// ── 自带静态服务器（与浏览器同进程） ──
let staticServer = null;
function startStaticServer() {
    return new Promise((resolve, reject) => {
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

if (!EXTERNAL) {
    await startStaticServer();
}

// 绕开本机代理
const cleanEnv = { ...process.env };
for (const k of Object.keys(cleanEnv)) {
    if (/proxy/i.test(k)) delete cleanEnv[k];
}
cleanEnv.NO_PROXY = '127.0.0.1,localhost';
cleanEnv.no_proxy = '127.0.0.1,localhost';

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

console.log('=== CM-006 cooldown 单一责任回归 ===\n');
console.log('[环境]');
console.log('  测试 URL :', BASE);
console.log('  Chrome   :', CHROME);
console.log('  CDP 端口 :', CDP_PORT);
console.log('  profile  :', PROFILE);

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);
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

// ── 页面错误收集 ──
const pageErrors = [];
const expectedErrors = [];
ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
        pageErrors.push(
            m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text
        );
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        const text =
            'console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' ');
        // 失败回滚场景会**故意**触发 fetch 失败，其日志属预期
        if (/Fetch error:/.test(text)) expectedErrors.push(text);
        else pageErrors.push(text);
    }
});

// ── 在每个新文档的页面脚本之前注入观测代码 ──
//
// 说明：fetch 的模式从 localStorage 读取，因为 localStorage 跨导航存活，
// 而 window 上的变量不会。这样每次 reload 后 stub 都能按当前场景生效。
const INSTRUMENT = `
(() => {
    // 1) 定时器观测
    const T = window.__timers = {
        intervalsCreated: 0,
        intervalsCleared: 0,
        intervalRecords: [],
        timeoutsCreated: 0,
        timeoutDelays: []
    };
    const _si = window.setInterval.bind(window);
    const _ci = window.clearInterval.bind(window);
    const _st = window.setTimeout.bind(window);
    window.setInterval = function (fn, ms, ...rest) {
        const rec = { fn, ms, id: null, cleared: false };
        const wrapped = function (...a) { return fn.apply(this, a); };
        rec.id = _si(wrapped, ms, ...rest);
        T.intervalRecords.push(rec);
        T.intervalsCreated += 1;
        return rec.id;
    };
    window.clearInterval = function (id) {
        T.intervalsCleared += 1;
        for (const r of T.intervalRecords) if (r.id === id) r.cleared = true;
        return _ci(id);
    };
    window.setTimeout = function (fn, ms, ...rest) {
        T.timeoutsCreated += 1;
        T.timeoutDelays.push(Number(ms) || 0);
        return _st(fn, ms, ...rest);
    };

    // 2) fetch 观测 / 离线桩
    const mode = localStorage.getItem('__fetchMode') || 'off';
    const stub = window.__stubState = { webhookCalls: 0, binCalls: 0, lastMsgId: null, mode };
    if (mode !== 'off') {
        window.fetch = async function (url) {
            const u = String(url);
            // 'fail-once'：只让**第一次** webhook 调用失败，用于覆盖
            // "失败回滚 → 立即重试成功 → 重新进入冷却" 这条完整链路。
            if (mode === 'fail-once' && stub.webhookCalls === 0 && u.indexOf('msgId=') !== -1) {
                stub.webhookCalls += 1;
                throw new Error('stub: simulated network failure');
            }
            if (mode === 'fail') {
                stub.webhookCalls += 1;
                throw new Error('stub: simulated network failure');
            }
            // webhook 请求带 msgId 查询参数
            if (u.indexOf('msgId=') !== -1) {
                stub.webhookCalls += 1;
                const m = /msgId=([^&]+)/.exec(u);
                stub.lastMsgId = m ? decodeURIComponent(m[1]) : null;
                return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
            }
            // JSONBin 回执：直接返回 read，终止轮询
            stub.binCalls += 1;
            return {
                ok: true, status: 200, statusText: 'OK',
                json: async () => ({ record: { msgId: stub.lastMsgId, status: 'read' } })
            };
        };
    }
})();
`;
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT }, S);

const ver = await httpGetJson('/json/version');
console.log('  浏览器   :', ver.Browser);
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 断言 ──
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

// ── 状态快照：动态 import 取到应用正在使用的同一模块实例 ──
//
// 对责任者接口做能力探测（typeof 判断）而不是直接调用：
// 在旧实现上跑反向验证时这些方法并不存在，直接调用会让脚本崩溃，
// 而崩溃是钝信号 —— 我们希望得到的是可读的 FAIL 明细。
const SNAP = `(async () => {
    const { state } = await import('/js/modules/state.js');
    const { countdown } = await import('/js/modules/countdown.js');
    const el = document.getElementById('countdown');
    const T = window.__timers || {};
    const st = window.__stubState || {};
    const has = (n, o) => typeof o[n] === 'function';
    return JSON.stringify({
        canClick: state.canClick,
        remaining: has('remaining', countdown) ? countdown.remaining() : null,
        hasTimer: countdown.timer !== null && countdown.timer !== undefined,
        ownerApi: {
            restore: has('restore', countdown),
            startFromNow: has('startFromNow', countdown),
            cancel: has('cancel', countdown),
            remaining: has('remaining', countdown)
        },
        stored: localStorage.getItem('lastClickTime'),
        intervalsCreated: T.intervalsCreated || 0,
        intervalsCleared: T.intervalsCleared || 0,
        armed: (T.intervalsCreated || 0) - (T.intervalsCleared || 0),
        timeoutsCreated: T.timeoutsCreated || 0,
        longTimeouts: (T.timeoutDelays || []).filter(d => d >= 5000).length,
        active: !!el && el.classList.contains('active'),
        text: document.getElementById('countdownText')?.textContent || '',
        webhookCalls: st.webhookCalls || 0
    });
})()`;

async function snap() {
    return JSON.parse(await evalJs(SNAP));
}

/**
 * 重置页面到干净状态并（可选）预置 lastClickTime，然后重新加载。
 * @param {Object} o
 * @param {string} [o.stored] 预置的 lastClickTime 原始字符串；省略则不写
 * @param {string} [o.fetchMode] 'off' | 'ok' | 'fail'
 */
async function seed({ stored, fetchMode = 'off' } = {}) {
    const setStored =
        stored === undefined
            ? ''
            : `localStorage.setItem('lastClickTime', ${JSON.stringify(stored)});`;
    await evalJs(`(() => {
        localStorage.clear();
        localStorage.setItem('userProfile', JSON.stringify({ nickname: '测试', emoji: 'x' }));
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('appLanguage', 'zh');
        localStorage.setItem('passwordSetTime', String(Date.now()));
        localStorage.setItem('__fetchMode', ${JSON.stringify(fetchMode)});
        ${setStored}
        return true;
    })()`);
    await goto(BASE + '/index.html');
}

/** 点击首页第一个按钮 */
async function clickFirstButton() {
    return evalJs(`(() => {
        const b = document.querySelector('.bubble-btn');
        if (!b) return 'no .bubble-btn';
        b.click();
        return 'ok';
    })()`);
}

console.log('─'.repeat(64));
console.log('S1 首次加载（无冷却）');
console.log('─'.repeat(64));
await goto(BASE + '/index.html');
await seed();
let s = await snap();
check('canClick = true（放行）', s.canClick === true, String(s.canClick));
check('remaining = 0', s.remaining === 0, String(s.remaining));
check('无 lastClickTime', s.stored === null, String(s.stored));
check('未武装 interval（armed = 0）', s.armed === 0, String(s.armed));
check('倒计时元素未激活', s.active === false, String(s.active));
check('倒计时文本为空', s.text === '', JSON.stringify(s.text));
check(
    '责任者接口齐全（restore/startFromNow/cancel/remaining）',
    s.ownerApi.restore && s.ownerApi.startFromNow && s.ownerApi.cancel && s.ownerApi.remaining,
    JSON.stringify(s.ownerApi)
);

console.log('\n' + '─'.repeat(64));
console.log('S2 刷新恢复（lastClickTime = now - 30s）');
console.log('─'.repeat(64));
await seed({ stored: String(Date.now() - 30000) });
s = await snap();
check('canClick = false（冷却中）', s.canClick === false, String(s.canClick));
check('剩余 ≈ 30s（29-30）', s.remaining === 30 || s.remaining === 29, String(s.remaining));
check('恰好武装 1 个 interval', s.armed === 1, String(s.armed));
check('倒计时元素已激活', s.active === true, String(s.active));
check('倒计时文本含剩余秒数', s.text.includes(String(s.remaining)), JSON.stringify(s.text));
check('lastClickTime 保留（未误删）', s.stored !== null, String(s.stored));
check(
    '未创建长延时 timeout（旧实现的恢复定时器）',
    s.longTimeouts === 0,
    `longTimeouts=${s.longTimeouts}`
);

console.log('\n' + '─'.repeat(64));
console.log('S3 归零（lastClickTime = now - 58s，等待约 3.5s）');
console.log('─'.repeat(64));
// 说明：预置时间戳在 Node 侧计算，而恢复发生在导航之后，
// 中间有几百毫秒的启动耗时，剩余秒数会有 ±1 的漂移。
// 因此这里断言区间而不是精确值，并给出足够的等待余量。
await seed({ stored: String(Date.now() - 58000) });
let s3a = await snap();
await wait(3500);
s = await snap();
check('初始剩余 1-2s', s3a.remaining === 1 || s3a.remaining === 2, String(s3a.remaining));
check('归零后 canClick = true', s.canClick === true, String(s.canClick));
check('归零后 remaining = 0', s.remaining === 0, String(s.remaining));
check('归零后清除 lastClickTime', s.stored === null, String(s.stored));
check('归零后 interval 已释放（armed = 0）', s.armed === 0, String(s.armed));
check('归零后元素取消激活', s.active === false, String(s.active));

console.log('\n' + '─'.repeat(64));
console.log('S4 请求成功（fetch 桩返回 200）');
console.log('─'.repeat(64));
await seed({ fetchMode: 'ok' });
check('首页按钮可点击', (await clickFirstButton()) === 'ok');
await wait(700);
s = await snap();
check('成功后有冷却', s.canClick === false, String(s.canClick));
check('剩余接近 60s（57-60）', s.remaining >= 57 && s.remaining <= 60, String(s.remaining));
check('恰好武装 1 个 interval', s.armed === 1, String(s.armed));
check('发出 1 次 webhook 请求', s.webhookCalls === 1, String(s.webhookCalls));
check(
    'lastClickTime 已写入且为有限数',
    s.stored !== null && Number.isFinite(parseInt(s.stored, 10)),
    String(s.stored)
);
const storedAfterClick = s.stored;
const webhookAfterClick = s.webhookCalls;

console.log('\n' + '─'.repeat(64));
console.log('S5 重复点击（冷却期间被阻止）');
console.log('─'.repeat(64));
const guardText = await evalJs(`(() => {
    const before = document.getElementById('notification')?.textContent || '';
    document.querySelector('.bubble-btn').click();
    return JSON.stringify({
        before,
        after: document.getElementById('notification')?.textContent || ''
    });
})()`);
await wait(400);
s = await snap();
let g = {};
try {
    g = JSON.parse(guardText);
} catch {
    /* ignore */
}
check('冷却期间显示等待提示', /请等待\s*\d+\s*秒/.test(g.after || ''), JSON.stringify(g.after));
check(
    '未发出第二次 webhook 请求',
    s.webhookCalls === webhookAfterClick,
    `${s.webhookCalls} vs ${webhookAfterClick}`
);
check(
    '未重复写入 lastClickTime',
    s.stored === storedAfterClick,
    `${s.stored} vs ${storedAfterClick}`
);
check('仍只有 1 个 interval（未叠加）', s.armed === 1, String(s.armed));
check('冷却未被提前解除', s.canClick === false, String(s.canClick));

console.log('\n' + '─'.repeat(64));
console.log('S6 请求失败回滚（第一次 webhook 失败，第二次成功）');
console.log('─'.repeat(64));
await seed({ fetchMode: 'fail-once' });
check('首页按钮可点击', (await clickFirstButton()) === 'ok');
await wait(700);
s = await snap();
check('失败后 canClick 立即恢复 true', s.canClick === true, String(s.canClick));
check('失败后清除 lastClickTime', s.stored === null, String(s.stored));
check('失败后 interval 已释放（armed = 0）', s.armed === 0, String(s.armed));
check('失败后元素取消激活', s.active === false, String(s.active));
check('失败时只发出 1 次 webhook 请求', s.webhookCalls === 1, String(s.webhookCalls));

// 立即重试：这一次桩会返回成功，应当重新进入冷却
const retry = await clickFirstButton();
await wait(700);
s = await snap();
check("重试结果是 'ok'", retry === 'ok', String(retry));
check('失败后可立即重试（再发一次请求）', s.webhookCalls === 2, String(s.webhookCalls));
check('重试成功后重新进入冷却', s.canClick === false, String(s.canClick));
check('重试成功后重新写入 lastClickTime', s.stored !== null, String(s.stored));
check('重试成功后恰好 1 个 interval', s.armed === 1, String(s.armed));

console.log('\n' + '─'.repeat(64));
console.log('S7 非法时间戳（应清理并放行）');
console.log('─'.repeat(64));
for (const bad of ['abc', '', 'NaN', 'Infinity', '-1', '0', '12abc?']) {
    await seed({ stored: bad });
    const sb = await snap();
    const label = JSON.stringify(bad);
    check(`${label} → canClick = true`, sb.canClick === true, String(sb.canClick));
    check(`${label} → 清除 key`, sb.stored === null, String(sb.stored));
    check(`${label} → armed = 0`, sb.armed === 0, String(sb.armed));
}

console.log('\n' + '─'.repeat(64));
console.log('S8 已过期（lastClickTime = now - 120s）');
console.log('─'.repeat(64));
await seed({ stored: String(Date.now() - 120000) });
s = await snap();
check('过期 → canClick = true', s.canClick === true, String(s.canClick));
check('过期 → 清除 lastClickTime', s.stored === null, String(s.stored));
check('过期 → armed = 0', s.armed === 0, String(s.armed));
check('过期 → 元素未激活', s.active === false, String(s.active));

console.log('\n' + '─'.repeat(64));
console.log('S9 未来时间戳（clock skew，应 clamp 到一个冷却周期）');
console.log('─'.repeat(64));
await seed({ stored: String(Date.now() + 3600000) });
s = await snap();
check('未来时间戳 → 进入冷却', s.canClick === false, String(s.canClick));
check('剩余被 clamp 到 60（而非 3660）', s.remaining === 60, String(s.remaining));
// 同时看**显示文本**：旧实现会把 3660 秒直接渲染出来，
// 因此这条断言不依赖责任者接口是否存在，可独立区分 clamp 行为。
// （seed() 固定 appLanguage = 'zh'，文案格式确定：'冷却中，{seconds}秒后可再次发送'）
check(
    '显示文本为 60 秒且未出现 3660',
    s.text.includes('60秒') && !s.text.includes('3660'),
    JSON.stringify(s.text)
);
check('仍然只有 1 个 interval', s.armed === 1, String(s.armed));
check('未被无限期锁死（remaining ≤ 60）', s.remaining <= 60, String(s.remaining));
check(
    '未静默改写存储（仍是原未来值）',
    s.stored !== null && parseInt(s.stored, 10) > Date.now(),
    String(s.stored)
);

console.log('\n' + '─'.repeat(64));
console.log('S10 timer 去重（重复 restore / 重复 start）');
console.log('─'.repeat(64));
await seed({ stored: String(Date.now() - 10000) });
const dedup = await evalJs(`(async () => {
    // 用 try/catch 包住：在旧实现（没有 restore 接口）上运行反向验证时，
    // 这里会抛错。返回结构化 error 而不是让脚本崩溃 ——
    // 崩溃是钝信号，可读的 FAIL 清单才是有效证据。
    try {
        const { countdown } = await import('/js/modules/countdown.js');
        const T = window.__timers;
        const armedNow = () => T.intervalsCreated - T.intervalsCleared;
        const trail = [armedNow()];
        countdown.restore();                 trail.push(armedNow());
        countdown.restore();                 trail.push(armedNow());
        countdown.restore();                 trail.push(armedNow());
        countdown.startFromNow();            trail.push(armedNow());
        countdown.startFromNow();            trail.push(armedNow());
        countdown.restore();                 trail.push(armedNow());
        return JSON.stringify({
            ok: true,
            trail,
            created: T.intervalsCreated,
            cleared: T.intervalsCleared,
            longTimeouts: T.timeoutDelays.filter(d => d >= 5000).length
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String((e && e.message) || e) });
    }
})()`);
let dd = {};
try {
    dd = JSON.parse(dedup);
} catch {
    /* ignore */
}
check('责任者提供 restore / startFromNow 接口', dd.ok === true, dd.error || '');
check(
    '任何时刻已武装 interval 都是 1',
    Array.isArray(dd.trail) && dd.trail.every((v) => v === 1),
    JSON.stringify(dd.trail)
);
check(
    '6 次重复调用后仍只有 1 个在跑',
    dd.created - dd.cleared === 1,
    `created=${dd.created} cleared=${dd.cleared}`
);
check('全程未出现长延时 timeout', dd.longTimeouts === 0, String(dd.longTimeouts));

console.log('\n' + '─'.repeat(64));
console.log('S11 旧 timer 不得覆盖新状态（代际守卫）');
console.log('─'.repeat(64));
await seed();
const stale = await evalJs(`(async () => {
    try {
        const { state } = await import('/js/modules/state.js');
        const { countdown } = await import('/js/modules/countdown.js');
        const T = window.__timers;

        // 第一次冷却：记下这一代的 interval 回调
        countdown.startFromNow();
        const firstRec = T.intervalRecords[T.intervalRecords.length - 1];
        if (!firstRec) return JSON.stringify({ ok: false, error: 'no interval recorded' });
        const staleFn = firstRec.fn;

        // 释放，再开始一次全新的冷却（新的一代）
        countdown.cancel();
        countdown.startFromNow();
        const afterRestart = {
            canClick: state.canClick,
            remaining: countdown.remaining()
        };

        // 手动执行**上一代**的 interval 回调：必须被忽略
        staleFn();

        return JSON.stringify({
            ok: true,
            afterRestart,
            afterStale: {
                canClick: state.canClick,
                remaining: countdown.remaining()
            },
            armed: T.intervalsCreated - T.intervalsCleared
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String((e && e.message) || e) });
    }
})()`);
let sl = {};
try {
    sl = JSON.parse(stale);
} catch {
    /* ignore */
}
check('责任者提供 cancel 接口', sl.ok === true, sl.error || '');
check('重启后处于冷却中', sl.afterRestart?.canClick === false, JSON.stringify(sl.afterRestart));
check(
    '旧回调未减少剩余时间',
    sl.afterStale?.remaining === sl.afterRestart?.remaining,
    `${JSON.stringify(sl.afterStale)} vs ${JSON.stringify(sl.afterRestart)}`
);
check('旧回调未解除冷却', sl.afterStale?.canClick === false, String(sl.afterStale?.canClick));
check('仍只有 1 个 interval', sl.armed === 1, String(sl.armed));

console.log('\n' + '─'.repeat(64));
console.log('S12 页面异常检查');
console.log('─'.repeat(64));
const uniqErr = [...new Set(pageErrors)];
check('无未捕获异常 / 非预期 console.error', uniqErr.length === 0, uniqErr.join(' | '));

console.log('\n' + '─'.repeat(64));
console.log('S13 同源性检查：cooldown 写入点唯一');
console.log('─'.repeat(64));
const srcCheck = await evalJs(`(async () => {
    const files = ['/js/modules/state.js','/js/main.js','/js/modules/buttonManager.js',
                   '/js/modules/notification.js','/js/modules/countdown.js'];

    // 剥离行注释后再统计：否则注释里出现的 "canClick = true" 会被误计。
    // 故意不使用正则字面量（多层转义易错），改用 indexOf 计数。
    const count = (hay, needle) => {
        let n = 0, i = 0;
        while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
        return n;
    };

    const out = {};
    for (const f of files) {
        const txt = await (await fetch(f)).text();
        let code = '';
        for (const line of txt.split('\\n')) {
            const i = line.indexOf('//');
            code += (i === -1 ? line : line.slice(0, i)) + '\\n';
        }

        // canClick 赋值：把每处 'canClick' 之后的开头片段拿来判断
        let canClickAssign = 0;
        const parts = code.split('canClick');
        for (let k = 1; k < parts.length; k++) {
            const tail = parts[k].slice(0, 12).trim();
            if (tail.startsWith('= true') || tail.startsWith('= false')) canClickAssign++;
        }

        out[f] = {
            // 冷却 key 的引用：字面量或本模块内的常量名都算
            keyRefs: count(code, 'lastClickTime') + count(code, 'STORAGE_KEY'),
            canClickAssign,
            setTimeout: count(code, 'setTimeout(')
        };
    }
    return JSON.stringify(out);
})()`);
let sc = {};
try {
    sc = JSON.parse(srcCheck);
} catch {
    /* ignore */
}
const OWNER = '/js/modules/countdown.js';
const others = Object.keys(sc).filter((f) => f !== OWNER);
check(
    '仅 countdown 触碰 lastClickTime key',
    others.every((f) => sc[f].keyRefs === 0),
    JSON.stringify(sc)
);
check(
    '仅 countdown 转换 state.canClick',
    others.every((f) => sc[f].canClickAssign === 0),
    JSON.stringify(sc)
);
check(
    'countdown 确实是唯一写入者（自身引用 > 0）',
    sc[OWNER].keyRefs > 0 && sc[OWNER].canClickAssign >= 2,
    JSON.stringify(sc[OWNER])
);
check(
    'cooldown 链路不再使用 setTimeout',
    sc[OWNER].setTimeout === 0 &&
        sc['/js/modules/state.js'].setTimeout === 0 &&
        sc['/js/main.js'].setTimeout === 0,
    JSON.stringify(sc)
);

console.log('\n=== 结果 ===');
console.log(`环境：${ver.Browser}`);
console.log(`URL ：${BASE}/index.html`);
console.log(`断言：${pass} passed, ${fail} failed`);
if (failedItems.length) {
    console.log('失败项：');
    failedItems.forEach((f) => console.log('  - ' + f));
}
if (expectedErrors.length) {
    console.log(`预期内的页面错误（失败回滚场景故意触发）：${expectedErrors.length} 条`);
}
if (uniqErr.length) {
    console.log('非预期页面错误：');
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

// 落盘（可选）：运行时证据，便于主 AI 复核而不必重跑
if (LOG_PATH) {
    try {
        writeFileSync(LOG_PATH, logLines.join('\n') + '\n', 'utf8');
        process.stderr.write(`\n[日志] 已写入 ${LOG_PATH}\n`);
    } catch (e) {
        process.stderr.write(`\n[日志] 写入失败：${e.message}\n`);
    }
}

process.exit(fail === 0 ? 0 : 1);
