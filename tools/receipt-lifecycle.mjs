// CM-008 已读回执轮询的生命周期回归脚本（可复现）
//
// 运行方式：
//   node tools/receipt-lifecycle.mjs
//
// 目标：验证 notification.js 的已读回执轮询可取消、单一所有权 ——
//       新一次发送开始时旧轮询立即停止且不得再写 #receiptStatus，
//       状态条只反映最新一次发送的回执；单次发送的节奏与超时语义不变。
//
// 观测方式（**不在生产代码里留任何测试钩子**）：
//   1. 页面内 `await import('/js/modules/notification.js')` 取到应用正在使用的
//      同一模块实例（ESM 记录按 URL 缓存），直接读轮询的 timer 句柄与代际标记。
//   2. CDP `Page.addScriptToEvaluateOnNewDocument` 在页面脚本之前包装
//      setTimeout / clearTimeout / fetch，得到「待触发的 2s 定时器数量」与
//      「JSONBin 请求次数」。
//   3. 桩的读取策略可在运行时改（`window.__stub.readForMsgId`），
//      因此同一个页面加载里能演完「第一次不读 → 第二次读」的并发场景。
//
// ★ 核心量化思路：判断「旧轮询是否真的死了」，不看定时器计数（易受 toast 等
//   其他定时器干扰），而看**旧轮询是否还在发请求** —— 若旧轮询存活，32s 窗口内
//   JSONBin 请求数会接近翻倍。这比计数更直接，也更稳定。
//
// 依赖：仅 Node 内置模块 + 本机 Chrome，零 npm 依赖。
// 本机注意：HTTP_PROXY 会劫持回环请求 → Chrome 带 --no-proxy-server；
//           静态服务器必须与浏览器同进程；CDP 端口默认 9449
//           （避开与 CM-004/006 重复的 9446、以及落在动态端口范围的 9445）。
import http from "node:http";
import { spawn } from "node:child_process";
import {
    createReadStream,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChrome } from "./chrome-path.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVE_PORT = Number(process.env.CM008_PORT || 8899);
const EXTERNAL = process.env.CM008_NO_SERVER === "1";
const BASE = process.env.CM008_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.CM008_CDP_PORT || 9449);
// Chrome 路径解析已统一到 tools/chrome-path.mjs（CM-009）：
// CM008_CHROME > CHROME_PATH > 常见安装位置 > which
const CHROME = resolveChrome(process.env.CM008_CHROME);
const PROFILE = path.join(os.tmpdir(), "cm008-receipt-profile");

const LOG_PATH = process.env.CM008_LOG || "";
const logLines = [];
{
    const raw = console.log.bind(console);
    console.log = (...a) => {
        const s = a.join(" ");
        logLines.push(s);
        raw(s);
    };
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
};

let staticServer = null;
if (!EXTERNAL) {
    await new Promise((resolve, reject) => {
        staticServer = http.createServer((req, res) => {
            let rel = decodeURIComponent(req.url.split("?")[0]);
            if (rel === "/") rel = "/index.html";
            const fp = path.join(ROOT, rel);
            if (!fp.startsWith(ROOT)) {
                res.writeHead(403);
                res.end("forbidden");
                return;
            }
            let st;
            try {
                st = statSync(fp);
            } catch {
                res.writeHead(404);
                res.end("not found");
                return;
            }
            if (!st.isFile()) {
                res.writeHead(404);
                res.end("not found");
                return;
            }
            res.writeHead(200, {
                "Content-Type": MIME[path.extname(fp)] || "application/octet-stream",
                "Cache-Control": "no-store",
            });
            createReadStream(fp).pipe(res);
        });
        staticServer.on("error", reject);
        staticServer.listen(SERVE_PORT, "127.0.0.1", () => resolve());
    });
}

const cleanEnv = { ...process.env };
for (const k of Object.keys(cleanEnv)) if (/proxy/i.test(k)) delete cleanEnv[k];
cleanEnv.NO_PROXY = "127.0.0.1,localhost";
cleanEnv.no_proxy = "127.0.0.1,localhost";

mkdirSync(PROFILE, { recursive: true });
const chromeProc = spawn(
    CHROME,
    [
        "--headless=new",
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${PROFILE}`,
        "--no-first-run",
        "--disable-gpu",
        "--no-sandbox",
        "--no-proxy-server",
        "--proxy-bypass-list=<-loopback>",
        "about:blank",
    ],
    { stdio: "ignore", env: cleanEnv }
);

function httpGetJson(pathname) {
    return new Promise((resolve, reject) => {
        const req = http.get(
            { host: "127.0.0.1", port: CDP_PORT, path: pathname, timeout: 4000 },
            res => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", c => (body += c));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        reject(new Error("bad json: " + body.slice(0, 120)));
                    }
                });
            }
        );
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", reject);
    });
}

async function getWsUrl() {
    for (let i = 0; i < 60; i++) {
        try {
            const j = await httpGetJson("/json/version");
            if (j.webSocketDebuggerUrl)
                return j.webSocketDebuggerUrl.replace("localhost", "127.0.0.1");
        } catch {
            /* retry */
        }
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error("CDP 未就绪：Chrome 是否启动？端口 " + CDP_PORT);
}

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        ws.addEventListener("message", ev => {
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
                    reject(new Error("timeout: " + method));
                }
            }, 20000);
        });
    }
}

console.log("=== CM-008 回执轮询生命周期回归 ===\n");

const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
});
const cdp = new CDP(ws);

const { targetInfos } = await cdp.send("Target.getTargets");
let target = targetInfos.find(t => t.type === "page");
if (!target) {
    const r = await cdp.send("Target.createTarget", { url: "about:blank" });
    target = { targetId: r.targetId };
}
const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
});
const S = sessionId;
await cdp.send("Page.enable", {}, S);
await cdp.send("Runtime.enable", {}, S);

const pageErrors = [];
ws.addEventListener("message", ev => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.exceptionThrown") {
        pageErrors.push(
            m.params.exceptionDetails.exception?.description ||
                m.params.exceptionDetails.text
        );
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        pageErrors.push(
            "console.error: " +
                m.params.args.map(a => a.value ?? a.description).join(" ")
        );
    }
});

// ── 页面脚本之前注入：定时器与 fetch 观测 ──
const INSTRUMENT = `
(() => {
    const T = window.__timers = {
        timeoutsCreated: 0,
        timeoutDelays: [],
        pending: {}            // id -> delay（仍在等待中的定时器）
    };
    const _st = window.setTimeout.bind(window);
    const _ct = window.clearTimeout.bind(window);
    window.setTimeout = function (fn, ms, ...rest) {
        const id = _st(fn, ms, ...rest);
        T.timeoutsCreated += 1;
        T.timeoutDelays.push(Number(ms) || 0);
        T.pending[id] = Number(ms) || 0;
        return id;
    };
    window.clearTimeout = function (id) {
        delete T.pending[id];
        return _ct(id);
    };

    // fetch 桩：webhook 与 JSONBin 两种请求分开计数。
    // 读取策略可在运行时改（readForMsgId），因此同一个页面加载里
    // 能演完"第一次不读、第二次读"的并发场景。
    const stub = window.__stub = {
        webhookCalls: 0,
        binCalls: 0,
        lastMsgId: null,
        readForMsgId: null,
        disabled: false
    };
    window.fetch = async function (url) {
        if (stub.disabled) throw new Error('stub: fetch disabled');
        const u = String(url);
        if (u.indexOf('msgId=') !== -1) {
            stub.webhookCalls += 1;
            const m = /msgId=([^&]+)/.exec(u);
            stub.lastMsgId = m ? decodeURIComponent(m[1]) : null;
            return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
        }
        stub.binCalls += 1;
        const match = stub.readForMsgId;
        return {
            ok: true, status: 200, statusText: 'OK',
            json: async () => ({
                record: {
                    msgId: match === null ? '__never__' : match,
                    status: 'read'
                }
            })
        };
    };
})();
`;
await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT }, S);

const ver = await httpGetJson("/json/version");
console.log("[环境]");
console.log("  测试 URL :", BASE);
console.log("  Chrome   :", ver.Browser);
console.log("  CDP 端口 :", CDP_PORT);
console.log("");

async function evalJs(expr) {
    const r = await cdp.send(
        "Runtime.evaluate",
        { expression: expr, returnByValue: true, awaitPromise: true },
        S
    );
    if (r.exceptionDetails) {
        throw new Error(
            "页面内异常: " +
                (r.exceptionDetails.exception?.description ||
                    r.exceptionDetails.text)
        );
    }
    return r.result.value;
}

async function goto(url) {
    await cdp.send("Page.navigate", { url }, S);
    for (let i = 0; i < 80; i++) {
        try {
            if ((await evalJs("document.readyState")) === "complete") break;
        } catch {
            /* navigating */
        }
        await new Promise(r => setTimeout(r, 120));
    }
    await new Promise(r => setTimeout(r, 400));
}

const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const failedItems = [];
function check(name, cond, extra = "") {
    if (cond) {
        pass++;
        console.log(`  PASS  ${name}`);
    } else {
        fail++;
        failedItems.push(name + (extra ? " -> " + extra : ""));
        console.log(`  FAIL  ${name}${extra ? " -> " + extra : ""}`);
    }
}

// ── 快照 ──
// 对 notification 的新接口做 typeof 能力探测：反向验证要跑旧代码，
// 旧版没有 receiptPollTimer / stopReceiptPolling，直接访问会让脚本崩溃。
const SNAP = `(async () => {
    const mod = await import('/js/modules/notification.js');
    const n = mod.notification;
    const { CONFIG } = await import('/js/modules/config.js');
    const el = document.getElementById('receiptStatus');
    const T = window.__timers || {};
    const stub = window.__stub || {};
    const hasTimerField = Object.prototype.hasOwnProperty.call(n, 'receiptPollTimer');
    const hasGenField = Object.prototype.hasOwnProperty.call(n, 'receiptPollGeneration');
    const pending2s = Object.values(T.pending || {}).filter(d => d === 2000).length;
    return JSON.stringify({
        cls: el ? el.className : null,
        text: el ? el.textContent : null,
        hasTimerField,
        hasGenField,
        hasStop: typeof n.stopReceiptPolling === 'function',
        pollArmed: hasTimerField ? n.receiptPollTimer !== null : null,
        generation: hasGenField ? n.receiptPollGeneration : null,
        webhookCalls: stub.webhookCalls || 0,
        binCalls: stub.binCalls || 0,
        lastMsgId: stub.lastMsgId || null,
        pending2s,
        notificationDuration: CONFIG.notificationDuration,
        binUrlPresent: !!(CONFIG.jsonBin && CONFIG.jsonBin.binUrl)
    });
})()`;

async function snap() {
    try {
        return JSON.parse(await evalJs(SNAP));
    } catch (e) {
        return { error: String(e.message || e) };
    }
}

/** 重置 LocalStorage 并加载首页 */
async function openApp() {
    await evalJs(`(() => {
        localStorage.clear();
        localStorage.setItem('userProfile', JSON.stringify({ nickname: '测试', emoji: 'x' }));
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('appLanguage', 'zh');
        localStorage.setItem('passwordSetTime', String(Date.now()));
        return true;
    })()`);
    await goto(BASE + "/index.html");
}

/** 设置桩的读取策略；null = 永不匹配 */
async function setReadFor(msgId) {
    await evalJs(
        `(() => { window.__stub.readForMsgId = ${JSON.stringify(msgId)}; return true; })()`
    );
}

/** 点击首页第一个按钮发送 */
async function clickSend() {
    return evalJs(`(() => {
        const b = document.querySelector('.bubble-btn');
        if (!b) return 'no .bubble-btn';
        b.click();
        return 'ok';
    })()`);
}

/**
 * 直接调用被测模块发送。
 *
 * 为什么并发场景不能靠"点两次按钮"：CM-006 之后点击链路会启动 60s 冷却
 * （countdown 是唯一责任者），第二次点击在冷却期会被闸门拦掉，
 * 根本进不到 sendNotification —— 那样就演不出"两次发送的轮询重叠"。
 * 因此需要连续发送的场景直接调用被测模块；点击链路本身由 S1/S2/S5 覆盖。
 */
async function sendViaModule() {
    return evalJs(`(async () => {
        const { notification } = await import('/js/modules/notification.js');
        const ok = await notification.sendNotification({
            message: '并发测试',
            nickname: '测试',
            emoji: 'x'
        });
        return String(ok);
    })()`);
}

await goto(BASE + "/index.html");

// ── 前置：能力探测与环境确认 ──
console.log("─".repeat(64));
console.log("S0 前置：模块接口与 JSONBin 配置");
console.log("─".repeat(64));
await openApp();
let s = await snap();
check("快照可取（模块可导入）", !s.error, s.error || "");
check("配置里有 JSONBin binUrl（否则轮询不会启动）", s.binUrlPresent === true,
    String(s.binUrlPresent));
const duration = s.notificationDuration;
console.log(`  （通知 toast 时长 notificationDuration = ${duration}；`
    + `与轮询的 2000ms 是否相同会影响定时器计数的解释）`);

// ── S1 单次发送：读到 read ──
console.log("\n" + "─".repeat(64));
console.log("S1 单次发送：读到 read");
console.log("─".repeat(64));
await openApp();
await setReadFor(null); // 先设为永不匹配
const t1 = await clickSend();
check("发送按钮可点击", t1 === "ok", String(t1));
await wait(300);
s = await snap();
check("发送后立刻是 sent 状态", s.cls === "receipt-status sent", String(s.cls));
check("发送后有轮询在等待（pollArmed = true）", s.pollArmed === true,
    String(s.pollArmed));
// 把读取策略切成本次消息，下一次轮询即可命中
await setReadFor(s.lastMsgId);
const tS1 = Date.now();
await wait(2600);
s = await snap();
check("读到 read → 状态条为 read", s.cls === "receipt-status read", String(s.cls));
check("read 文案已本地化写入", typeof s.text === "string" && s.text.length > 0,
    JSON.stringify(s.text));
check("命中后轮询不再排队（pollArmed = false）", s.pollArmed === false,
    String(s.pollArmed));
check(
    "节奏：约 2s 内命中（1 次 bin 请求）",
    s.binCalls === 1 && Date.now() - tS1 < 4000,
    `binCalls=${s.binCalls}, elapsed≈${Date.now() - tS1}ms`
);

// ── S2 单次发送：始终读不到 → timeout ──
console.log("\n" + "─".repeat(64));
console.log("S2 单次发送：始终读不到 → 15 次后 timeout（约 32s）");
console.log("─".repeat(64));
await openApp();
await setReadFor(null);
const t2 = await clickSend();
check("发送按钮可点击", t2 === "ok", String(t2));
await wait(300);
s = await snap();
check("轮询已启动", s.pollArmed === true, String(s.pollArmed));
check("尚未超时（仍为 sent）", s.cls === "receipt-status sent", String(s.cls));

const tS2 = Date.now();
await wait(35000);
s = await snap();
const elapsed2 = Date.now() - tS2;
check("超时后状态条为 timeout", s.cls === "receipt-status timeout", String(s.cls));
check("timeout 文案已写入", typeof s.text === "string" && s.text.length > 0,
    JSON.stringify(s.text));
check(
    "节奏不变：共 15 次 bin 请求",
    s.binCalls === 15,
    String(s.binCalls)
);
check(
    "超时耗时约 30-36s",
    elapsed2 >= 28000 && elapsed2 <= 42000,
    `${elapsed2}ms`
);
check("超时后轮询不再排队", s.pollArmed === false, String(s.pollArmed));

// ── S3 并发打断（核心）──
console.log("\n" + "─".repeat(64));
console.log("S3 并发打断：第二次发送时第一次轮询仍在进行");
console.log("─".repeat(64));
await openApp();
await setReadFor(null); // 第一次：永不匹配，让轮询持续跑
const t3 = Date.now();
const first = await sendViaModule();
check("第一次发送成功", first === "true", String(first));
await wait(5000); // 第一次轮询已进行约 2 次
s = await snap();
const firstMsgId = s.lastMsgId;
const firstGen = s.generation;
const binCallsAfterFirst = s.binCalls;
check("第一次轮询仍在进行（pollArmed = true）", s.pollArmed === true,
    String(s.pollArmed));
check("第一次已发出 ≥1 次 bin 请求", binCallsAfterFirst >= 1,
    String(binCallsAfterFirst));

// 第二次发送：此时第一次轮询仍在跑
const second = await sendViaModule();
check("第二次发送成功", second === "true", String(second));
await wait(300);
s = await snap();
const secondMsgId = s.lastMsgId;
check("第二次发送的 msgId 与第一次不同", secondMsgId && secondMsgId !== firstMsgId,
    `${firstMsgId} vs ${secondMsgId}`);
check("第二次发送后状态条从 sent 重新开始",
    s.cls === "receipt-status sent", String(s.cls));
check(
    "旧轮询已被失效（代际自增）",
    typeof s.generation === "number" &&
        typeof firstGen === "number" &&
        s.generation > firstGen,
    `${firstGen} -> ${s.generation}`
);
check("同一时刻活跃轮询 ≤ 1（仍只有一个轮询在等待）",
    s.pollArmed === true, String(s.pollArmed));

// 让第二次能读到
await setReadFor(secondMsgId);
const binBeforeRead = s.binCalls;
await wait(2600);
s = await snap();
check("第二次发送读到 read → 状态条为 read",
    s.cls === "receipt-status read", String(s.cls));
const binCallsWhenRead = s.binCalls;
check("第二次读取确实发生了（bin 请求增加）",
    binCallsWhenRead > binBeforeRead,
    `${binBeforeRead} -> ${binCallsWhenRead}`);

// ★ 关键：等到第一次轮询原本会超时的时刻（第一次发送后约 32s），
//   若旧轮询没被取消，它的 timeout 分支会把状态条改写成 timeout。
const needWait = Math.max(0, 34000 - (Date.now() - t3));
console.log(`  （第一次发送已过去约 ${Date.now() - t3}ms，`
    + `再等 ${Math.round(needWait / 1000)}s 越过它的原超时点）`);
await wait(needWait + 1000);
s = await snap();
check(
    "★ 旧轮询的超时分支未覆盖新状态条（仍为 read）",
    s.cls === "receipt-status read",
    String(s.cls)
);
check(
    "★ 旧轮询已停止发请求（bin 请求 ≤ 6）",
    s.binCalls <= 6,
    `binCalls=${s.binCalls}`
);
check("最终无活跃轮询", s.pollArmed === false, String(s.pollArmed));
console.log(
    `  （本次共 ${s.binCalls} 次 bin 请求。判定依据：第一次轮询在交接前约 2 次、`
    + `第二次轮询读到 read 只需 1 次 → 约 3 次；`
    + `若第一次轮询仍存活，它会一直跑到第 15 次，总数会到 15 次以上）`
);

// ── S4 宽容语义 ──
console.log("\n" + "─".repeat(64));
console.log("S4 宽容语义：msgId 为空 / binUrl 缺失");
console.log("─".repeat(64));
await openApp();
const s4base = await evalJs(`(async () => {
    const { notification } = await import('/js/modules/notification.js');
    const T = window.__timers;
    const before = T.timeoutsCreated;
    let threw = null;
    try {
        notification.pollReadStatus('');
        notification.pollReadStatus(undefined);
        notification.pollReadStatus(null);
    } catch (e) { threw = String(e && e.message || e); }
    return JSON.stringify({
        threw,
        newTimeouts: T.timeoutsCreated - before,
        binCalls: (window.__stub || {}).binCalls || 0
    });
})()`);
let s4 = {};
try {
    s4 = JSON.parse(s4base);
} catch {
    /* ignore */
}
check("msgId 为空/缺失时不抛异常", s4.threw === null, String(s4.threw));
check("msgId 为空时不启动轮询（未新增定时器）", s4.newTimeouts === 0,
    String(s4.newTimeouts));
check("msgId 为空时不发 bin 请求", s4.binCalls === 0, String(s4.binCalls));

const s4b = await evalJs(`(async () => {
    const { CONFIG } = await import('/js/modules/config.js');
    const { notification } = await import('/js/modules/notification.js');
    const T = window.__timers;
    const saved = CONFIG.jsonBin;
    const before = T.timeoutsCreated;
    let threw = null;
    try {
        delete CONFIG.jsonBin;
        notification.pollReadStatus('m-1');
    } catch (e) { threw = String(e && e.message || e); }
    finally { CONFIG.jsonBin = saved; }
    return JSON.stringify({
        threw,
        newTimeouts: T.timeoutsCreated - before,
        binCalls: (window.__stub || {}).binCalls || 0,
        restored: !!(CONFIG.jsonBin && CONFIG.jsonBin.binUrl)
    });
})()`);
let s4bObj = {};
try {
    s4bObj = JSON.parse(s4b);
} catch {
    /* ignore */
}
check("binUrl 缺失时不抛异常", s4bObj.threw === null, String(s4bObj.threw));
check("binUrl 缺失时不启动轮询", s4bObj.newTimeouts === 0,
    String(s4bObj.newTimeouts));
check("binUrl 缺失时不发 bin 请求", s4bObj.binCalls === 0,
    String(s4bObj.binCalls));
check("CONFIG.jsonBin 已被测试还原", s4bObj.restored === true,
    String(s4bObj.restored));

// ── S5 可取消性：stop 之后旧回调不得再写状态条 ──
console.log("\n" + "─".repeat(64));
console.log("S5 可取消性：stopReceiptPolling 之后状态条不再被改写");
console.log("─".repeat(64));
await openApp();
await setReadFor(null);
const t5 = await clickSend();
check("发送可点击", t5 === "ok", String(t5));
await wait(2600);
s = await snap();
check("轮询进行中", s.pollArmed === true, String(s.pollArmed));
check("代际字段可读", typeof s.generation === "number", String(s.generation));

if (s.hasStop === true) {
    // 显式置成一个可识别的状态，然后停止轮询并等待越过原超时点
    await evalJs(`(async () => {
        const { notification } = await import('/js/modules/notification.js');
        notification.setReceiptStatus('read');
        notification.stopReceiptPolling();
        return true;
    })()`);
    const binAtStop = (await snap()).binCalls;
    await wait(35000);
    s = await snap();
    check("stop 后状态条保持 read（未被旧轮询改写为 timeout）",
        s.cls === "receipt-status read", String(s.cls));
    check("stop 后不再发 bin 请求", s.binCalls === binAtStop,
        `${binAtStop} -> ${s.binCalls}`);
    check("stop 后无活跃轮询", s.pollArmed === false, String(s.pollArmed));
    check("stop 后 timer 句柄被清空", s.pollArmed === false, String(s.pollArmed));
} else {
    check("提供 stopReceiptPolling 接口", false,
        "旧实现没有该接口（反向验证时会命中此条）");
}

// ── S6 定时器计数（辅助证据）──
console.log("\n" + "─".repeat(64));
console.log("S6 定时器计数（辅助证据）");
console.log("─".repeat(64));
await openApp();
await setReadFor(null);
await sendViaModule();
await wait(500);
s = await snap();
console.log(`  （待触发的 2000ms 定时器：${s.pending2s}；`
    + `notificationDuration = ${s.notificationDuration}）`);
// 用轮询自身的 timer 句柄做权威判断；待触发计数作为辅助（toast 等可能各占一个）
check("轮询句柄非空（权威：只有一个轮询在等）", s.pollArmed === true,
    String(s.pollArmed));
const pendingTolerance = s.notificationDuration === 2000 ? 2 : 1;
check(
    `待触发的 2000ms 定时器 ≤ ${pendingTolerance}（辅助，容忍 toast）`,
    s.pending2s <= pendingTolerance,
    `pending2s=${s.pending2s}`
);
// 再发一次（直接调模块，绕过 60s 冷却闸门），验证旧 timer 被 clear 而不是叠加
const before = s.pending2s;
await sendViaModule();
await wait(500);
s = await snap();
check("第二次发送后待触发计数未叠加（旧 timer 已 clear）",
    s.pending2s <= before + pendingTolerance,
    `${before} -> ${s.pending2s}`);
check("第二次发送后仍只有一个轮询句柄", s.pollArmed === true,
    String(s.pollArmed));

// ── S7 同源性扫描：参数遮蔽已修 + 状态条写入点唯一 ──
console.log("\n" + "─".repeat(64));
console.log("S7 同源性：参数遮蔽与状态条写入点");
console.log("─".repeat(64));
// 源码扫描在 **Node 侧**做：页面里的 window.fetch 已被测试桩替换，
// 不能用它去取源文件（桩返回的对象没有 .text()）。
const src = readFileSync(
    path.join(ROOT, "js/modules/notification.js"),
    "utf8"
);
const countIn = (hay, needle) => {
    let n = 0;
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) {
        n++;
        i += needle.length;
    }
    return n;
};
const sc = {
    hasShadowParam: src.indexOf("setReceiptStatus(state)") !== -1,
    hasRenamedParam: src.indexOf("setReceiptStatus(statusName)") !== -1,
    // 注意：`this.receiptPollTimer = setTimeout(poll, 2000)` 也**包含**
    // `setTimeout(poll, 2000)` 这个子串，所以"裸调用"要用差值算，
    // 否则会把已被句柄接住的那两处误计成裸调用。
    bareSetTimeoutInPoll:
        countIn(src, "setTimeout(poll, 2000)") -
        countIn(src, "= setTimeout(poll, 2000)"),
    handledSetTimeout: countIn(src, "= setTimeout(poll, 2000)"),
    hasStop: src.indexOf("stopReceiptPolling()") !== -1,
    clearCalls: countIn(src, "clearTimeout(this.receiptPollTimer)"),
    terminalNullOut: countIn(src, "this.receiptPollTimer = null;"),
};
check("不再有遮蔽模块 state 的参数名", sc.hasShadowParam === false,
    `hasShadowParam=${sc.hasShadowParam}`);
check("参数已重命名为 statusName", sc.hasRenamedParam === true,
    `hasRenamedParam=${sc.hasRenamedParam}`);
check("轮询的 setTimeout 全部被句柄接住",
    sc.bareSetTimeoutInPoll === 0 && sc.handledSetTimeout === 2,
    `bare=${sc.bareSetTimeoutInPoll}, handled=${sc.handledSetTimeout}`);
check("存在停止接口与 clearTimeout 调用",
    sc.hasStop === true && sc.clearCalls >= 1,
    `hasStop=${sc.hasStop}, clearCalls=${sc.clearCalls}`);
check("终态会清空句柄（stop 1 处 + 两个终态各 1 处，至少 3 处）",
    sc.terminalNullOut >= 3,
    `terminalNullOut=${sc.terminalNullOut}`);

// ── S8 页面异常 ──
console.log("\n" + "─".repeat(64));
console.log("S8 页面异常检查");
console.log("─".repeat(64));
const uniqErr = [...new Set(pageErrors)];
check("全流程无未捕获异常 / console.error", uniqErr.length === 0,
    uniqErr.join(" | "));

console.log("\n=== 结果 ===");
console.log(`环境：${ver.Browser}`);
console.log(`URL ：${BASE}/index.html`);
console.log(`断言：${pass} passed, ${fail} failed`);
if (failedItems.length) {
    console.log("失败项：");
    failedItems.forEach(f => console.log("  - " + f));
}
if (uniqErr.length) {
    console.log("页面错误：");
    uniqErr.forEach(e => console.log("  - " + e));
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
if (LOG_PATH) {
    try {
        writeFileSync(LOG_PATH, logLines.join("\n") + "\n", "utf8");
        process.stderr.write(`\n[日志] 已写入 ${LOG_PATH}\n`);
    } catch (e) {
        process.stderr.write(`\n[日志] 写入失败：${e.message}\n`);
    }
}
process.exit(fail === 0 ? 0 : 1);
