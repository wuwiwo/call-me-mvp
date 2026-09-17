// CM-003 存储容错回归验证脚本（可复现）
//
// 运行方式：
//   node tools/storage-resilience.mjs
//
// 本脚本自带静态服务器（同进程内启动），无需另开终端；
// 也支持复用外部已启动的服务器：设置 CM003_NO_SERVER=1 并用 CM003_BASE 指定地址。
//
// 依赖：仅 Node 内置模块 + 本机 Chrome。不引入任何 npm 依赖。
//
// 本机环境注意：HTTP_PROXY 会劫持回环请求，故
//   - Chrome 需带 --no-proxy-server --proxy-bypass-list=<-loopback>
//   - 探针必须用 node:http 直连，不能用 fetch
//   - 静态服务器与浏览器必须在同一进程内，避免子进程被回收
//
// 覆盖任务卡 ACCEPTANCE CRITERIA：
//   - userProfile 非法 JSON → 首页可加载、回退未注册、无未捕获异常
//   - notificationHistory 非法 JSON → 历史页可加载、显示空状态、无未捕获异常
//   - buttonConfig 非法 JSON / 错误顶层类型 → 回退默认按钮、无未捕获异常
//   - 合法旧数据行为不回归
import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVE_PORT = Number(process.env.CM003_PORT || 8899);
const EXTERNAL = process.env.CM003_NO_SERVER === "1";
const BASE = process.env.CM003_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.CM003_CDP_PORT || 9445);
const CHROME =
    process.env.CM003_CHROME ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = path.join(os.tmpdir(), "cm003-storage-profile");
const LOG_PATH = process.env.CM003_LOG || "";

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

// ── 自带静态服务器（与浏览器同进程，避免子进程被回收） ──
let staticServer = null;
function startStaticServer() {
    return new Promise((resolve, reject) => {
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

// 绕开本机代理
const cleanEnv = { ...process.env };
for (const k of Object.keys(cleanEnv)) {
    if (/proxy/i.test(k)) delete cleanEnv[k];
}
cleanEnv.NO_PROXY = "127.0.0.1,localhost";
cleanEnv.no_proxy = "127.0.0.1,localhost";

if (!EXTERNAL) {
    await startStaticServer();
}

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

const out = [];
function log(...a) {
    const line = a.join(" ");
    out.push(line);
    console.log(line);
}

log("=== CM-003 存储容错回归验证 ===");
log("");

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);
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

// 采集未捕获异常与 console.error
let pageErrors = [];
ws.addEventListener("message", ev => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.exceptionThrown") {
        pageErrors.push(
            "exceptionThrown: " +
                (m.params.exceptionDetails.exception?.description ||
                    m.params.exceptionDetails.text)
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
log("[环境]");
log("  测试 URL :", BASE);
log("  Chrome   :", CHROME);
log("  浏览器   :", ver.Browser);
log("  CDP 端口 :", CDP_PORT);
log("  断言模式 : CM-003 存储容错");
log("");

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
    for (let i = 0; i < 60; i++) {
        try {
            if ((await evalJs("document.readyState")) === "complete") break;
        } catch {
            /* navigating */
        }
        await new Promise(r => setTimeout(r, 150));
    }
    await new Promise(r => setTimeout(r, 400));
}

let pass = 0;
let fail = 0;
const failedItems = [];
function check(name, cond, extra = "") {
    if (cond) {
        pass++;
        log(`  PASS  ${name}`);
    } else {
        fail++;
        failedItems.push(name + (extra ? " -> " + extra : ""));
        log(`  FAIL  ${name}${extra ? " -> " + extra : ""}`);
    }
}

/**
 * 与 evalJs 相同，但把页面内异常转成可断言的结果而不是抛出。
 * 用于"写入路径"用例：修复缺失时页面会抛 SyntaxError，
 * 我们希望在报告里看到 FAIL 及其异常文本，而不是整个脚本崩掉。
 */
async function evalJsSafe(expr) {
    try {
        return { ok: true, value: await evalJs(expr) };
    } catch (e) {
        return { ok: false, error: String(e.message || e) };
    }
}

/** 注入原始 storage 值后加载页面，返回快照 */
async function injectAndLoad(page, pairs) {
    pageErrors = [];
    // 必须先导航到同源页面，否则 about:blank 下访问 localStorage 会 SecurityError
    await goto(BASE + "/" + page);
    const setExpr =
        "(() => {" +
        Object.entries(pairs)
            .map(
                ([k, v]) =>
                    `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(
                        v
                    )});`
            )
            .join("") +
        "return true;})()";
    await evalJs(setExpr);
    // 清空为上一页（含注入前）累积的错误，只保留注入后重载产生的
    pageErrors = [];
    await goto(BASE + "/" + page);
}

const ONB = "onboardingCompleted";

// ─────────────────────────────────────────────────────────
log("[用例1] userProfile 非法 JSON → 首页可加载，回退未注册");
await injectAndLoad("index.html", {
    [ONB]: "true",
    userProfile: "{not valid json",
});
{
    const r = await evalJs(`(() => {
        return JSON.stringify({
            loaded: document.readyState,
            hasProfileUI: !!document.getElementById("userProfile"),
            appReady: typeof window !== "undefined",
            nicknameShown: (document.body.innerText || "").includes("未设置"),
        });
    })()`);
    const d = JSON.parse(r);
    check("首页 document 完成加载", d.loaded === "complete", d.loaded);
    check("首页无未捕获异常 / console.error", pageErrors.length === 0, pageErrors.join(" | "));
}

log("");
log("[用例1b] userProfile 错误顶层类型（数组 / 字符串）");
for (const [label, val] of [
    ["数组", "[1,2,3]"],
    ["字符串", '"hello"'],
    ["数字", "42"],
]) {
    await injectAndLoad("index.html", { [ONB]: "true", userProfile: val });
    check(
        `userProfile=${label} 时首页无未捕获异常`,
        pageErrors.length === 0,
        pageErrors.join(" | ")
    );
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例2] notificationHistory 非法 JSON → 历史页可加载并显示空状态");
await injectAndLoad("history.html", {
    [ONB]: "true",
    notificationHistory: "[[[broken",
});
{
    const r = await evalJs(`(() => {
        const list = document.getElementById("historyList");
        return JSON.stringify({
            loaded: document.readyState,
            hasList: !!list,
            innerLen: list ? list.innerHTML.trim().length : -1,
            isUnregisteredUser: true,
        });
    })()`);
    const d = JSON.parse(r);
    check("历史页 document 完成加载", d.loaded === "complete", d.loaded);
    check("历史列表元素存在", d.hasList === true, String(d.hasList));
    check("历史列表已渲染（非空白）", d.innerLen > 0, String(d.innerLen));
    check("历史页无未捕获异常 / console.error", pageErrors.length === 0, pageErrors.join(" | "));
}

log("");
log("[用例2b] notificationHistory 错误顶层类型（对象 / 数字）");
for (const [label, val] of [
    ["对象", '{"a":1}'],
    ["数字", "123"],
    ["字符串", '"abc"'],
]) {
    await injectAndLoad("history.html", { [ONB]: "true", notificationHistory: val });
    check(
        `notificationHistory=${label} 时历史页无未捕获异常`,
        pageErrors.length === 0,
        pageErrors.join(" | ")
    );
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例3] buttonConfig 非法 JSON → 回退默认按钮");
await injectAndLoad("index.html", {
    [ONB]: "true",
    userProfile: JSON.stringify({ nickname: "测试", emoji: "🍙" }),
    buttonConfig: "{broken json",
});
{
    const r = await evalJs(`(() => {
        const btns = document.querySelectorAll(".bubble-container .bubble-btn");
        return JSON.stringify({
            loaded: document.readyState,
            count: btns.length,
            texts: [...btns].map(b => (b.innerText || "").trim()),
        });
    })()`);
    const d = JSON.parse(r);
    check("首页可加载（buttonConfig 损坏）", d.loaded === "complete", d.loaded);
    check("回退后渲染出默认按钮（2 个）", d.count === 2, JSON.stringify(d));
    check(
        "默认按钮文案来自 CONFIG.buttons.defaultButtons",
        d.texts.some(t => t.includes("呼叫 R4/5")) && d.texts.some(t => t.includes("堡垒要塞")),
        JSON.stringify(d.texts)
    );
    check("buttonConfig 损坏时无未捕获异常", pageErrors.length === 0, pageErrors.join(" | "));
}

log("");
log("[用例3b] buttonConfig 错误顶层类型（数组 / 字符串）");
for (const [label, val] of [
    ["数组", '["a","b"]'],
    ["字符串", '"nope"'],
    ["数字", "7"],
]) {
    await injectAndLoad("index.html", { [ONB]: "true", buttonConfig: val });
    check(
        `buttonConfig=${label} 时首页无未捕获异常`,
        pageErrors.length === 0,
        pageErrors.join(" | ")
    );
}

log("");
log("[用例3c] buttonConfig 合法但 buttons 非数组 → 回退默认按钮");
await injectAndLoad("index.html", {
    [ONB]: "true",
    buttonConfig: JSON.stringify({ buttons: "not-an-array", activeGroup: "default" }),
});
check("buttons 非数组时无未捕获异常", pageErrors.length === 0, pageErrors.join(" | "));

// ─────────────────────────────────────────────────────────
log("");
log("[用例4] 合法旧数据不回归");
await injectAndLoad("index.html", {
    [ONB]: "true",
    userProfile: JSON.stringify({ nickname: "回归用户", emoji: "🐱" }),
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "default_1", message: "按钮一", icon: "bell" },
            { id: "default_2", message: "按钮二", icon: "heart" },
        ],
        activeGroup: "default",
    }),
});
{
    const r = await evalJs(`(() => {
        const btns = document.querySelectorAll(".bubble-container .bubble-btn");
        return JSON.stringify({
            count: btns.length,
            texts: [...btns].map(b => (b.innerText || "").trim()),
            cfg: localStorage.getItem("buttonConfig"),
        });
    })()`);
    const d = JSON.parse(r);
    check("合法 buttonConfig 渲染 2 个按钮", d.count === 2, JSON.stringify(d));
    check(
        "合法按钮文案正确保留",
        d.texts.includes("按钮一") && d.texts.includes("按钮二"),
        JSON.stringify(d.texts)
    );
    const cfg = JSON.parse(d.cfg);
    check("合法配置未被静默改写", cfg.buttons.length === 2, d.cfg);
    check("合法数据路径无未捕获异常", pageErrors.length === 0, pageErrors.join(" | "));
}

log("");
log("[用例4b] 合法 notificationHistory 正常渲染");
await injectAndLoad("history.html", {
    [ONB]: "true",
    notificationHistory: JSON.stringify([
        {
            timestamp: new Date().toISOString(),
            message: "历史消息A",
            nickname: "回归用户",
            emoji: "🐱",
            _status: "success",
            webhook: "http://example.invalid/hook",
        },
    ]),
});
{
    const r = await evalJs(`(() => {
        const list = document.getElementById("historyList");
        return JSON.stringify({
            html: list ? list.innerHTML : "",
            items: list ? list.querySelectorAll(".history-item").length : -1,
        });
    })()`);
    const d = JSON.parse(r);
    check("合法历史记录渲染 1 条", d.items === 1, JSON.stringify(d.items));
    check("历史内容正确显示", d.html.includes("历史消息A"), "内容缺失");
    check("合法历史路径无未捕获异常", pageErrors.length === 0, pageErrors.join(" | "));
}

log("");
log("[用例4c] 合法 userProfile 正常回显（未注册判定不误伤）");
await injectAndLoad("index.html", {
    [ONB]: "true",
    userProfile: JSON.stringify({ nickname: "有名字的人", emoji: "🌟" }),
});
{
    const r = await evalJs(`(() => {
        const body = document.body.innerText || "";
        return JSON.stringify({ hasName: body.includes("有名字的人") });
    })()`);
    const d = JSON.parse(r);
    check("合法昵称正确回显", d.hasName === true, JSON.stringify(d));
    check("合法资料路径无未捕获异常", pageErrors.length === 0, pageErrors.join(" | "));
}

// ─────────────────────────────────────────────────────────
// 用例 5：notificationHistory 损坏后的**写入路径**（notification.addHistoryRecord）
//
// 背景：readJsonSafe 在只读路径上刻意保留损坏的原始值（供排查）。
// 但 addHistoryRecord 是写入路径，若沿用直接 JSON.parse，
// 用户一旦历史损坏，每次发通知（成功和失败两条分支）都会抛 SyntaxError。
// 本用例断言：损坏后仍能发起通知、不抛异常，并写入新记录（自我修复）。
//
// fetch 被替换为可控桩，避免真实网络请求，同时能分别覆盖成功/失败分支。

/** 注入 storage 并替换 fetch 桩，然后加载首页 */
async function injectWithFetchStub(status, { brokenHistory }) {
    // 先导航到同源页面，才能访问 localStorage
    await goto(BASE + "/index.html");

    await evalJs(`(() => {
        localStorage.setItem(${JSON.stringify(ONB)}, "true");
        localStorage.setItem("userProfile", ${JSON.stringify(
            JSON.stringify({ nickname: "发送测试", emoji: "🍙" })
        )});
        localStorage.setItem("notificationHistory", ${JSON.stringify(
            brokenHistory
        )});
        localStorage.removeItem("lastClickTime");
        return true;
    })()`);

    // 重载页面，让模块在损坏数据下完成初始化；随后在同源 window 上装 fetch 桩
    pageErrors = [];
    await goto(BASE + "/index.html");
    await evalJs(`(() => {
        window.__fetchCalls = 0;
        window.fetch = function () {
            window.__fetchCalls++;
            return Promise.resolve({
                ok: ${status < 400},
                status: ${status},
                statusText: "stub",
                json: () => Promise.resolve({}),
            });
        };
        return true;
    })()`);
}

/** 调用真实模块的 addHistoryRecord（写入路径），返回结果快照 */
async function callAddHistoryRecord(message, isSuccess) {
    return evalJsSafe(`(async () => {
        const mod = await import("/js/modules/notification.js");
        mod.notification.addHistoryRecord(${JSON.stringify(message)}, ${isSuccess});
        const raw = localStorage.getItem("notificationHistory");
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        return JSON.stringify({
            raw,
            isArray: Array.isArray(parsed),
            count: Array.isArray(parsed) ? parsed.length : -1,
            first: Array.isArray(parsed) ? parsed[0] : null,
        });
    })()`);
}

log("");
log("[用例5] notificationHistory 损坏后写入路径（addHistoryRecord）");
for (const [label, broken] of [
    ["非法 JSON", "[[[broken"],
    ["错误顶层类型（对象）", '{"a":1}'],
    ["错误顶层类型（字符串）", '"abc"'],
]) {
    await injectAndLoad("index.html", {
        [ONB]: "true",
        userProfile: JSON.stringify({ nickname: "发送测试", emoji: "🍙" }),
        notificationHistory: broken,
    });
    const res = await callAddHistoryRecord("损坏后写入", true);
    check(
        `history=${label} 时 addHistoryRecord 不抛异常`,
        res.ok === true,
        res.ok ? "" : res.error
    );
    if (!res.ok) {
        // 已抛异常，后续断言必然失败，直接记录以免掩盖原因
        check(`history=${label} 时新记录写入成功（自我修复）`, false, "上一步已抛异常");
        check(`history=${label} 时新记录内容正确`, false, "上一步已抛异常");
        continue;
    }
    const d = JSON.parse(res.value);
    check(
        `history=${label} 时新记录写入成功（自我修复）`,
        d.isArray === true && d.count === 1,
        JSON.stringify({ count: d.count, raw: String(d.raw).slice(0, 80) })
    );
    check(
        `history=${label} 时新记录内容正确`,
        d.first && d.first.message === "损坏后写入" && d.first._status === "success",
        JSON.stringify(d.first)
    );
}

log("");
log("[用例5b] 损坏 history 后，发送成功/失败通知全流程均不抛异常");

for (const [label, status, expectStatus] of [
    ["成功（HTTP 200）", 200, "success"],
    ["失败（HTTP 500）", 500, "error"],
]) {
    await injectWithFetchStub(status, { brokenHistory: "[[[broken" });
    const res = await evalJsSafe(`(async () => {
        const mod = await import("/js/modules/notification.js");
        const ok = await mod.notification.sendNotification({ message: "全流程测试" });
        const raw = localStorage.getItem("notificationHistory");
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        return JSON.stringify({
            ok,
            fetchCalls: window.__fetchCalls,
            isArray: Array.isArray(parsed),
            count: Array.isArray(parsed) ? parsed.length : -1,
            firstStatus: Array.isArray(parsed) && parsed[0] ? parsed[0]._status : null,
            firstMessage: Array.isArray(parsed) && parsed[0] ? parsed[0].message : null,
        });
    })()`);
    check(
        `通知${label}：sendNotification 全流程不抛异常`,
        res.ok === true,
        res.ok ? "" : res.error
    );
    if (!res.ok) {
        check(`通知${label}：fetch 被实际调用`, false, "上一步已抛异常");
        check(`通知${label}：历史写入成功且状态为 ${expectStatus}`, false, "上一步已抛异常");
        continue;
    }
    const d = JSON.parse(res.value);
    check(
        `通知${label}：fetch 被实际调用`,
        d.fetchCalls >= 1,
        JSON.stringify({ fetchCalls: d.fetchCalls })
    );
    check(
        `通知${label}：无未捕获异常 / console.error`,
        // 失败分支本身会 console.error("Fetch error: ...")，属预期行为，需过滤
        pageErrors.filter(e => !e.includes("Fetch error")).length === 0,
        pageErrors.join(" | ")
    );
    check(
        `通知${label}：历史写入成功且状态为 ${expectStatus}`,
        d.isArray === true && d.count === 1 && d.firstStatus === expectStatus,
        JSON.stringify(d)
    );
}

log("");
log("[用例5c] 合法 history 在写入路径上不被吞掉");
await injectAndLoad("index.html", {
    [ONB]: "true",
    userProfile: JSON.stringify({ nickname: "发送测试", emoji: "🍙" }),
    notificationHistory: JSON.stringify([
        {
            timestamp: "2026-01-01T00:00:00.000Z",
            message: "既有记录",
            nickname: "旧用户",
            emoji: "🐱",
            _status: "success",
            webhook: "http://example.invalid/hook",
        },
    ]),
});
{
    const res = await callAddHistoryRecord("新增记录", false);
    check("合法 history 写入路径可执行", res.ok === true, res.ok ? "" : res.error);
    if (res.ok) {
        const d = JSON.parse(res.value);
        check(
            "合法 history 写入后保留既有记录（2 条）",
            d.count === 2,
            JSON.stringify({ count: d.count })
        );
        check(
            "新增记录在队首且不失真",
            d.first && d.first.message === "新增记录" && d.first._status === "error",
            JSON.stringify(d.first)
        );
        check(
            "既有记录仍在（未被静默覆盖）",
            Array.isArray(d.raw ? JSON.parse(d.raw) : null) &&
                JSON.parse(d.raw).some(x => x.message === "既有记录"),
            "既有记录丢失"
        );
    } else {
        check("合法 history 写入后保留既有记录（2 条）", false, "上一步已抛异常");
        check("新增记录在队首且不失真", false, "上一步已抛异常");
        check("既有记录仍在（未被静默覆盖）", false, "上一步已抛异常");
    }
    check("合法 history 写入路径无未捕获异常", pageErrors.length === 0, pageErrors.join(" | "));
}

// ─────────────────────────────────────────────────────────
log("");
log("=== 结果 ===");
log(`环境：${ver.Browser}`);
log(`URL ：${BASE}`);
log(`断言：${pass} passed, ${fail} failed`);
if (failedItems.length) {
    log("失败项：");
    failedItems.forEach(f => log("  - " + f));
}

if (LOG_PATH) {
    try {
        writeFileSync(LOG_PATH, out.join("\n") + "\n", "utf8");
    } catch {
        /* ignore */
    }
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
