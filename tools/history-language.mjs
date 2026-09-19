// CM-007 历史页语言回归脚本（可复现）
//
// 运行方式：
//   node tools/history-language.mjs
//
// 目标：验证 history.html 使用与首页相同的语言设置与翻译体系 ——
//       文档标题、顶部标题、返回/清除按钮 title、空状态、错误 Webhook 标签、
//       清除成功 toast 均随 appLanguage 变化；同时历史渲染与清除行为不变。
//
// 观测方式（**不在生产代码里留任何测试钩子**）：
//   页面内 `await import('/js/modules/translations.js')` 取到应用正在使用的
//   同一模块实例（ESM 记录按 URL 缓存），从而把"页面实际显示的值"与
//   "翻译表里该语言的值"做逐项比对；再叠加"四语言互不相同"与少量 golden 值，
//   防止把英文串复制到其他语言也算通过。
//
// 依赖：仅 Node 内置模块 + 本机 Chrome，零 npm 依赖。
// 本机注意：HTTP_PROXY 会劫持回环请求 → Chrome 带 --no-proxy-server；
//           静态服务器必须与浏览器同进程。
import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChrome } from "./chrome-path.mjs";

// 直接读翻译表：纯数据模块，无 DOM 依赖，可以在 Node 里安全导入
import { TRANSLATIONS } from "../js/modules/translations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVE_PORT = Number(process.env.CM007_PORT || 8899);
const EXTERNAL = process.env.CM007_NO_SERVER === "1";
const BASE = process.env.CM007_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.CM007_CDP_PORT || 9448);
// Chrome 路径解析已统一到 tools/chrome-path.mjs（CM-009）：
// CM007_CHROME > CHROME_PATH > 常见安装位置 > which
const CHROME = resolveChrome(process.env.CM007_CHROME);
const PROFILE = path.join(os.tmpdir(), "cm007-history-lang-profile");

const LOG_PATH = process.env.CM007_LOG || "";
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

console.log("=== CM-007 历史页语言回归 ===\n");

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

const LANGS = ["zh", "en", "ja", "ko"];

// ── 翻译表完整性 / 语言间差异（表级检查，不依赖页面）──
console.log("─".repeat(64));
console.log("T1 翻译表：history 键完整性");
console.log("─".repeat(64));
const REQUIRED = [
    "pageTitle",
    "backTitle",
    "clearTitle",
    "cleared",
    "webhookLabel",
    "empty",
];
const tableLangs = Object.keys(TRANSLATIONS);
check("支持语言含 zh/en/ja/ko", LANGS.every(l => tableLangs.includes(l)),
    tableLangs.join(","));
for (const l of LANGS) {
    const h = TRANSLATIONS[l]?.history || {};
    const missing = REQUIRED.filter(
        k => typeof h[k] !== "string" || h[k].trim() === ""
    );
    check(`${l}.history 六个键齐全且非空`, missing.length === 0,
        missing.length ? "缺: " + missing.join(",") : "");
}

console.log("\n" + "─".repeat(64));
console.log("T2 翻译表：四语言取值互不相同（防止把英文复制到其他语言）");
console.log("─".repeat(64));
// webhookLabel 是技术术语，四语言取值可能相同（en/ja 都用 "Webhook URL"），
// 因此不纳入"互不相同"检查。改为两条更准确的断言：
//   1) zh 必须恰好是 "Webhook" —— 这是一条**跨任务兼容约束**：
//      tools/input-safety.mjs 的 error 行断言把它钉进了期望字符串
//      （`f.err === \`Webhook: ${...}\``），而该文件不在本任务 SCOPE 内、不能修改。
//      这里显式锁定，避免以后有人改 zh 取值时静默打红 CM-005。
//   2) 四语言均非空。
for (const k of ["pageTitle", "backTitle", "clearTitle", "cleared"]) {
    const vals = LANGS.map(l => TRANSLATIONS[l].history[k]);
    const uniq = new Set(vals);
    check(`${k} 四语言取值互不相同`, uniq.size === LANGS.length,
        JSON.stringify(vals));
}
check(
    "zh.webhookLabel 恰为 'Webhook'（与 CM-005 断言的期望前缀兼容）",
    TRANSLATIONS.zh.history.webhookLabel === "Webhook",
    JSON.stringify(TRANSLATIONS.zh.history.webhookLabel)
);
check(
    "webhookLabel 四语言均非空",
    LANGS.every(l => {
        const v = TRANSLATIONS[l].history.webhookLabel;
        return typeof v === "string" && v.trim() !== "";
    }),
    JSON.stringify(LANGS.map(l => TRANSLATIONS[l].history.webhookLabel))
);
// golden：钉住少量具体值，避免"语言串位"（如 ja 用了 en 的串）
const GOLDEN = {
    zh: { pageTitle: "通知历史", backTitle: "返回" },
    en: { pageTitle: "Notification History", backTitle: "Back" },
    ja: { pageTitle: "通知履歴", backTitle: "戻る" },
    ko: { pageTitle: "알림 기록", backTitle: "뒤로" },
};
for (const l of LANGS) {
    check(
        `${l}.pageTitle /.backTitle 命中 golden 值`,
        TRANSLATIONS[l].history.pageTitle === GOLDEN[l].pageTitle &&
            TRANSLATIONS[l].history.backTitle === GOLDEN[l].backTitle,
        `${JSON.stringify(TRANSLATIONS[l].history.pageTitle)} / ${JSON.stringify(TRANSLATIONS[l].history.backTitle)}`
    );
}

// ── 页面侧快照 ──
const SNAP = `(async () => {
    const lang = localStorage.getItem('appLanguage');
    const q = id => document.getElementById(id);
    const items = [...document.querySelectorAll('.history-item')].map(el => ({
        cls: el.className,
        name: el.querySelector('.history-name')?.textContent ?? null,
        message: el.querySelector('.history-message')?.textContent ?? null,
        emoji: el.querySelector('.history-emoji')?.textContent ?? null,
        error: el.querySelector('.history-error')?.textContent ?? null
    }));
    const emptyEl = document.querySelector('.empty-state');
    const store = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        store[k] = localStorage.getItem(k);
    }
    return JSON.stringify({
        ok: true,
        appLanguage: lang,
        docTitle: document.title,
        topTitle: q('historyTitle')?.textContent ?? null,
        backTitle: q('historyBack')?.getAttribute('title') ?? null,
        clearTitle: q('clearHistory')?.getAttribute('title') ?? null,
        emptyText: emptyEl ? emptyEl.textContent : null,
        items,
        store
    });
})()`;

async function snapHistory() {
    return JSON.parse(await evalJs(SNAP));
}

/** 预置 LocalStorage 后加载 history.html */
async function openHistory({ lang, records } = {}) {
    const setLang =
        lang === undefined
            ? "localStorage.removeItem('appLanguage');"
            : `localStorage.setItem('appLanguage', ${JSON.stringify(lang)});`;
    const setRecords =
        records === undefined
            ? ""
            : `localStorage.setItem('notificationHistory', ${JSON.stringify(
                  JSON.stringify(records)
              )});`;
    await evalJs(`(() => {
        localStorage.clear();
        localStorage.setItem('userProfile', JSON.stringify({ nickname: '测试', emoji: 'x' }));
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('buttonDisplayMode', 'default');
        ${setLang}
        ${setRecords}
        return true;
    })()`);
    await goto(BASE + "/history.html");
}

// 两条基准记录：一条 success、一条 error（error 行会显示 Webhook 标签）
const RECORDS = [
    {
        timestamp: "2026-09-19T10:00:00.000Z",
        message: "早安",
        nickname: "阿珍",
        emoji: "🐟",
        _status: "success",
        webhook: "https://example.com/hook",
    },
    {
        timestamp: "2026-09-19T11:00:00.000Z",
        message: "出错了",
        nickname: "阿强",
        emoji: "🐟",
        _status: "error",
        webhook: "https://example.com/hook?x=1",
    },
];

// ── 四种语言：静态文案 ──
console.log("\n" + "─".repeat(64));
console.log("T3 四种语言：文档标题 / 顶部标题 / 两个按钮 title / 错误 Webhook 标签");
console.log("─".repeat(64));
await goto(BASE + "/history.html");
for (const l of LANGS) {
    await openHistory({ lang: l, records: RECORDS });
    const s = await snapHistory();
    const t = TRANSLATIONS[l].history;
    const errItem = s.items.find(i => i.error !== null);

    check(`${l}: appLanguage 已写入`, s.appLanguage === l, String(s.appLanguage));
    check(`${l}: 文档标题 = ${JSON.stringify(t.pageTitle)}`,
        s.docTitle === t.pageTitle, JSON.stringify(s.docTitle));
    check(`${l}: 顶部标题 = ${JSON.stringify(t.pageTitle)}`,
        s.topTitle === t.pageTitle, JSON.stringify(s.topTitle));
    check(`${l}: 返回按钮 title = ${JSON.stringify(t.backTitle)}`,
        s.backTitle === t.backTitle, JSON.stringify(s.backTitle));
    check(`${l}: 清除按钮 title = ${JSON.stringify(t.clearTitle)}`,
        s.clearTitle === t.clearTitle, JSON.stringify(s.clearTitle));
    check(
        `${l}: 错误行标签 = ${JSON.stringify(t.webhookLabel)}`,
        errItem && errItem.error === `${t.webhookLabel}: https://example.com/hook?x=1`,
        JSON.stringify(errItem ? errItem.error : null)
    );
}

// ── 空状态 ──
console.log("\n" + "─".repeat(64));
console.log("T4 四种语言：空状态");
console.log("─".repeat(64));
for (const l of LANGS) {
    await openHistory({ lang: l, records: [] });
    const s = await snapHistory();
    const t = TRANSLATIONS[l].history;
    check(`${l}: 空状态文本 = ${JSON.stringify(t.empty)}`,
        s.emptyText === t.empty, JSON.stringify(s.emptyText));
    check(`${l}: 空状态时无 history-item`, s.items.length === 0,
        String(s.items.length));
}

// ── 无记录（key 缺失）也走空状态 ──
await openHistory({ lang: "ja" });
let s = await snapHistory();
check("notificationHistory 缺失时显示空状态",
    s.emptyText === TRANSLATIONS.ja.history.empty, JSON.stringify(s.emptyText));

// ── 记录渲染不变 ──
console.log("\n" + "─".repeat(64));
console.log("T5 记录渲染：内容与状态 class 不变");
console.log("─".repeat(64));
await openHistory({ lang: "en", records: RECORDS });
s = await snapHistory();
check("渲染出 2 条记录", s.items.length === 2, String(s.items.length));
check("success 行 class = 'history-item success'",
    s.items[0]?.cls === "history-item success", String(s.items[0]?.cls));
check("error 行 class = 'history-item error'",
    s.items[1]?.cls === "history-item error", String(s.items[1]?.cls));
check("昵称按文本渲染", s.items[0]?.name === "阿珍", String(s.items[0]?.name));
check("消息按文本渲染", s.items[0]?.message === "早安", String(s.items[0]?.message));
check("emoji 按文本渲染", s.items[0]?.emoji === "🐟", String(s.items[0]?.emoji));
check("success 行不显示 Webhook 标签",
    s.items[0]?.error === null, String(s.items[0]?.error));

// ── 语言回退 ──
console.log("\n" + "─".repeat(64));
console.log("T6 语言回退：未设置 / 非法语言");
console.log("─".repeat(64));
// 期望值按 language.js 的既有规则在页面内算出（浏览器语言受支持则用它，否则 zh）
const expectedFallback = JSON.parse(
    await evalJs(`(() => {
        const browserLang = navigator.language.split('-')[0];
        const supported = ['zh','en','ja','ko'];
        return JSON.stringify({
            browserLang,
            expected: supported.includes(browserLang) ? browserLang : 'zh'
        });
    })()`)
);
await openHistory({});
s = await snapHistory();
check(
    `未设置 appLanguage → 按既有规则回退到 ${expectedFallback.expected}`,
    s.docTitle === TRANSLATIONS[expectedFallback.expected].history.pageTitle,
    `浏览器语言=${expectedFallback.browserLang}, 实际标题=${JSON.stringify(s.docTitle)}`
);
check("未设置时页面仍正常渲染（不阻断）", s.ok === true, "");

await openHistory({ lang: "fr" });
s = await snapHistory();
check(
    `非法语言 'fr' → 按既有规则回退到 ${expectedFallback.expected}`,
    s.docTitle === TRANSLATIONS[expectedFallback.expected].history.pageTitle,
    JSON.stringify(s.docTitle)
);
check(
    "非法语言时标题不是原始键名（未回退成 'history.pageTitle'）",
    s.docTitle !== "history.pageTitle" && !!s.docTitle,
    JSON.stringify(s.docTitle)
);

await openHistory({ lang: "" });
s = await snapHistory();
check("空字符串 appLanguage → 回退且不阻断",
    s.docTitle === TRANSLATIONS[expectedFallback.expected].history.pageTitle,
    JSON.stringify(s.docTitle));

// ── 清除：只删 notificationHistory，且 toast 跟随语言 ──
console.log("\n" + "─".repeat(64));
console.log("T7 清除动作：数据范围 + toast 文案");
console.log("─".repeat(64));
for (const l of LANGS) {
    await openHistory({ lang: l, records: RECORDS });
    const before = await snapHistory();
    const toastText = await evalJs(`(() => {
        document.getElementById('clearHistory').click();
        const el = document.querySelector('.history-toast');
        return el ? el.textContent : null;
    })()`);
    await wait(150);
    const after = await snapHistory();

    check(`${l}: 清除后 notificationHistory 被移除`,
        after.store.notificationHistory === undefined,
        String(after.store.notificationHistory));
    // 其余 key 必须原样保留
    const otherKeys = Object.keys(before.store).filter(k => k !== "notificationHistory");
    const kept = otherKeys.every(k => after.store[k] === before.store[k]);
    check(`${l}: 其他 LocalStorage 数据未被改动（${otherKeys.length} 个 key）`,
        kept, otherKeys.filter(k => after.store[k] !== before.store[k]).join(","));
    check(`${l}: 清除 toast = ${JSON.stringify(TRANSLATIONS[l].history.cleared)}`,
        toastText === TRANSLATIONS[l].history.cleared, JSON.stringify(toastText));
    check(`${l}: 清除后重新渲染为空状态`,
        after.emptyText === TRANSLATIONS[l].history.empty &&
            after.items.length === 0,
        JSON.stringify(after.emptyText));
}

// ── 输入安全仍成立 ──
console.log("\n" + "─".repeat(64));
console.log("T8 历史输入安全：恶意字段仍只作为文本");
console.log("─".repeat(64));
const XSS_RECORDS = [
    {
        // 合法 error 状态 + 全部字段带恶意标记：
        // 用于验证"error 行会显示本地化 Webhook 标签"，且标签后的 URL 仍是纯文本
        timestamp: "2026-09-19T12:00:00.000Z",
        message: '<img src=x onerror="window.__pwned=1">',
        nickname: '<script>window.__pwned=2</script>',
        emoji: '<svg onload="window.__pwned=3">',
        _status: "error",
        webhook: '"><img src=x onerror="window.__pwned=4">',
    },
    {
        // 非法 _status：用于验证不会注入状态 class（该行也不应出现 error 行）
        timestamp: "2026-09-19T13:00:00.000Z",
        message: "x",
        nickname: "y",
        emoji: "z",
        _status: 'success"><b>bad',
        webhook: "https://example.com/h",
    },
];
await openHistory({ lang: "zh", records: XSS_RECORDS });
const xss = JSON.parse(
    await evalJs(`(() => {
        const list = document.getElementById('historyList');
        const items = [...list.querySelectorAll('.history-item')];
        const errEl = list.querySelector('.history-error');
        const text = (el, sel) => el.querySelector(sel)?.textContent ?? null;
        return JSON.stringify({
            pwned: window.__pwned ?? null,
            count: items.length,
            classes: items.map(el => el.className),
            injectedNodes: list.querySelectorAll('script,img,svg,b').length,
            onAttrs: [...list.querySelectorAll('*')]
                .flatMap(el => [...el.attributes])
                .filter(a => /^on/i.test(a.name)).length,
            name0: text(items[0], '.history-name'),
            message0: text(items[0], '.history-message'),
            emoji0: text(items[0], '.history-emoji'),
            errorCount: list.querySelectorAll('.history-error').length,
            errorText: errEl ? errEl.textContent : null,
            html: list.innerHTML
        });
    })()`)
);
check("脚本/事件未执行（__pwned 未设置）", xss.pwned === null, String(xss.pwned));
check("渲染出 2 条记录", xss.count === 2, String(xss.count));
check("无注入元素（script/img/svg/b 计数为 0）",
    xss.injectedNodes === 0, String(xss.injectedNodes));
check("无 on* 事件属性", xss.onAttrs === 0, String(xss.onAttrs));
check("合法 error 行 class = 'history-item error'",
    xss.classes[0] === "history-item error", String(xss.classes[0]));
check("非法 _status 不注入状态 class（恰为 'history-item'）",
    xss.classes[1] === "history-item", String(xss.classes[1]));
check("只有合法 error 行出现 Webhook 标签", xss.errorCount === 1,
    String(xss.errorCount));
check("恶意 message 作为字面文本显示",
    xss.message0 === '<img src=x onerror="window.__pwned=1">',
    JSON.stringify(xss.message0));
check("恶意 nickname 作为字面文本显示",
    xss.name0 === "<script>window.__pwned=2</script>", JSON.stringify(xss.name0));
check("恶意 emoji 作为字面文本显示",
    xss.emoji0 === '<svg onload="window.__pwned=3">', JSON.stringify(xss.emoji0));
check("恶意 webhook 作为字面文本显示（含本地化标签前缀）",
    xss.errorText ===
        `${TRANSLATIONS.zh.history.webhookLabel}: "><img src=x onerror="window.__pwned=4">`,
    JSON.stringify(xss.errorText));
check("innerHTML 中不含真实 <img/<script/<svg 标签",
    !/<(img|script|svg)\s/i.test(xss.html),
    xss.html.slice(0, 160));

// ── 首页不回归 ──
console.log("\n" + "─".repeat(64));
console.log("T9 首页不受影响（language.js 的容错改动不改变首页行为）");
console.log("─".repeat(64));
for (const l of LANGS) {
    await evalJs(`(() => {
        localStorage.clear();
        localStorage.setItem('userProfile', JSON.stringify({ nickname: '测试', emoji: 'x' }));
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('passwordSetTime', String(Date.now()));
        localStorage.setItem('appLanguage', ${JSON.stringify(l)});
        return true;
    })()`);
    await goto(BASE + "/index.html");
    const idx = JSON.parse(
        await evalJs(`(async () => {
            const { TRANSLATIONS } = await import('/js/modules/translations.js');
            const t = TRANSLATIONS[${JSON.stringify(l)}];
            return JSON.stringify({
                title: document.getElementById('title')?.textContent ?? null,
                subtitle: document.getElementById('subtitle')?.textContent ?? null,
                currentLanguage: document.getElementById('currentLanguage')?.textContent ?? null,
                userName: document.getElementById('userName')?.textContent ?? null,
                docTitle: document.title,
                expectTitle: t.common.title,
                expectSubtitle: t.mainPage.subtitle,
                expectUnregistered: t.common.unregistered
            });
        })()`)
    );
    check(`${l}: 首页主标题使用该语言`,
        idx.title === idx.expectTitle, JSON.stringify(idx.title));
    check(`${l}: 首页副标题使用该语言`,
        idx.subtitle === idx.expectSubtitle, JSON.stringify(idx.subtitle));
    check(`${l}: 首页语言指示器已更新`,
        idx.currentLanguage === (l === "zh" ? "中" : l.toUpperCase()),
        String(idx.currentLanguage));
    check(`${l}: 首页用户名正常写入`,
        idx.userName === "测试", JSON.stringify(idx.userName));
}
// 语言切换菜单仍可用（元素齐全路径未被容错改动破坏）
const menuState = JSON.parse(
    await evalJs(`(() => {
        const toggle = document.getElementById('languageToggle');
        const menu = document.getElementById('languageMenu');
        toggle.click();
        const opened = menu.classList.contains('show');
        document.body.click();
        return JSON.stringify({ opened, closed: !menu.classList.contains('show') });
    })()`)
);
check("首页语言菜单可打开", menuState.opened === true, String(menuState.opened));
check("首页语言菜单可关闭", menuState.closed === true, String(menuState.closed));

// ── 页面异常 ──
console.log("\n" + "─".repeat(64));
console.log("T10 页面异常检查");
console.log("─".repeat(64));
const uniqErr = [...new Set(pageErrors)];
check("全流程无未捕获异常 / console.error", uniqErr.length === 0,
    uniqErr.join(" | "));

console.log("\n=== 结果 ===");
console.log(`环境：${ver.Browser}`);
console.log(`URL ：${BASE}/history.html + ${BASE}/index.html`);
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
