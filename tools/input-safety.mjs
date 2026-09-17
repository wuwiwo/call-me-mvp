// CM-005 动态用户输入 HTML 注入 — 回归验证脚本（可复现）
//
// 运行方式：
//   node tools/input-safety.mjs
//
// 本脚本自带静态服务器（与 Chrome 同进程），无需另开终端。
// 也支持复用外部服务器：设置 CM005_NO_SERVER=1 并用 CM005_BASE 指定地址。
//
// 依赖：仅 Node 内置模块 + 本机 Chrome。不引入任何 npm 依赖。
//
// 本机环境注意（与前序脚本同因）：
//   - HTTP_PROXY 会劫持回环请求 → Chrome 带 --no-proxy-server --proxy-bypass-list=<-loopback>
//   - 探针用 node:http 直连，不能用 fetch
//   - 静态服务器必须与浏览器同进程，否则子进程被回收
//
// 覆盖任务卡 ACCEPTANCE CRITERIA：
//   - 恶意昵称/按钮文字/历史 message/nickname/webhook 只作为文本显示
//   - 按钮编辑表单的 value 与图标回显不被恶意输入破坏
//   - icon 受白名单/安全 token 约束，不能注入任意 class 或 HTML
//   - 历史 _status 与字段缺失不突破 DOM，success/error 显示不回归
//   - 新增/编辑/删除/渲染/点击行为不回归
//
// 判定"注入未发生"的四类证据（每类都独立断言）：
//   1. window.__pwned 未被设置（脚本/事件属性未执行）
//   2. 容器内不存在 SCRIPT/IMG/SVG/IFRAME 等注入元素
//   3. 容器内不存在任何 on* 事件属性
//   4. 恶意串以**字面文本**形式出现在 textContent 中
//      （证明是被当作文本渲染，而不是被过滤掉或当作 HTML 解析）
import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVE_PORT = Number(process.env.CM005_PORT || 8899);
const EXTERNAL = process.env.CM005_NO_SERVER === "1";
const BASE = process.env.CM005_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.CM005_CDP_PORT || 9447);
const CHROME =
    process.env.CM005_CHROME ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = path.join(os.tmpdir(), "cm005-input-safety-profile");
const LOG_PATH = process.env.CM005_LOG || "";

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

// ── 自带静态服务器（与浏览器同进程） ──
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

log("=== CM-005 动态用户输入注入防护回归验证 ===");
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
log("  断言模式 : CM-005 输入安全");
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

/** 与 evalJs 相同，但把页面内异常转成可断言的结果而不是抛出 */
async function evalJsSafe(expr) {
    try {
        return { ok: true, value: await evalJs(expr) };
    } catch (e) {
        return { ok: false, error: String(e.message || e) };
    }
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

const ONB = "onboardingCompleted";

// ── 恶意载荷 ──
const P = {
    scriptTag: "<script>window.__pwned=1</script>",
    imgOnerror: '<img src=x onerror="window.__pwned=1">',
    attrBreak: '"><img src=x onerror="window.__pwned=1">',
    eventAttr: '" onmouseover="window.__pwned=1',
    eventAttrSingle: "' onfocus='window.__pwned=1",
    svgOnload: "<svg/onload=window.__pwned=1>",
    structBreak: '</span><b id="inj">INJECTED</b>',
};

// 恶意 icon：都必须在"安全 token"字符集之外
const ICON_P = {
    attrBreak: 'bolt"><img src=x onerror="window.__pwned=1">',
    withSpace: "bolt onmouseover=window.__pwned=1",
    quoteOnly: 'bolt"',
    slash: "bolt/onload",
};

// 只允许形如 fa-bolt / fa-exclamation-triangle 的 class 尾巴
const ICON_CLASS_RE = /^fas fa-[a-z0-9][a-z0-9-]*$/;
// 合法的 dataset.value / 存储值
const ICON_TOKEN_RE = /^[a-z0-9][a-z0-9-]{0,49}$/;

/**
 * 注入 storage 后加载指定页面。
 * 先 localStorage.clear() 再写 pairs —— 每个用例从干净状态起步，
 * 避免 Chrome profile 跨运行残留脏数据。
 */
async function injectAndLoad(page, pairs) {
    await goto(BASE + "/index.html");
    await evalJs(`localStorage.clear(); true`);
    const setExpr =
        "(() => {" +
        Object.entries(pairs)
            .filter(([, v]) => v !== null)
            .map(
                ([k, v]) =>
                    `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(
                        v
                    )});`
            )
            .join("") +
        "return true;})()";
    await evalJs(setExpr);
    pageErrors = [];
    await goto(BASE + "/" + page);
}

/** 生成"容器审计"表达式：四类注入证据一次取回 */
function auditExpr(rootSel) {
    return `(() => {
        const root = document.querySelector(${JSON.stringify(rootSel)});
        if (!root) return JSON.stringify({ missing: true });
        const badAttrs = [], badTags = [];
        root.querySelectorAll("*").forEach(el => {
            for (const a of Array.from(el.attributes)) {
                if (/^on/i.test(a.name)) badAttrs.push(el.tagName + "@" + a.name);
            }
            const t = el.tagName.toUpperCase();
            if (["SCRIPT","IMG","IFRAME","OBJECT","EMBED","SVG"].includes(t)) badTags.push(t);
        });
        return JSON.stringify({
            badAttrs,
            badTags,
            pwned: typeof window.__pwned !== "undefined",
            text: root.textContent,
            html: root.innerHTML,
            count: root.querySelectorAll("*").length,
        });
    })()`;
}

async function audit(rootSel) {
    return JSON.parse(await evalJs(auditExpr(rootSel)));
}

/** 四类注入证据的统一断言 */
function checkNoInjection(label, a) {
    check(`${label}：无元素注入（无 SCRIPT/IMG/SVG 等）`, a.badTags.length === 0, JSON.stringify(a.badTags));
    check(`${label}：无事件属性注入（无 on* 属性）`, a.badAttrs.length === 0, JSON.stringify(a.badAttrs));
    check(`${label}：脚本/事件未执行（__pwned 未设置）`, a.pwned === false, String(a.pwned));
}

async function openModal() {
    await evalJs(`document.getElementById("editButtons").click(); true`);
    await new Promise(r => setTimeout(r, 200));
}

// ─────────────────────────────────────────────────────────
log("[用例1] 首页按钮渲染：恶意 message 与恶意 icon");
await injectAndLoad("index.html", {
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "quick_online", message: P.scriptTag, icon: ICON_P.attrBreak },
            { id: "emergency", message: P.imgOnerror, icon: "bolt" },
        ],
        activeGroup: "default",
    }),
});

{
    const a = await audit(".bubble-container");
    const n = await evalJs(
        `document.querySelectorAll(".bubble-container .bubble-btn").length`
    );
    check("首页渲染 2 个按钮", n === 2, String(n));
    checkNoInjection("首页按钮容器", a);
    check(
        "恶意 message（script 标签）以字面文本显示",
        a.text.includes(P.scriptTag),
        a.text.slice(0, 120)
    );
    check(
        "恶意 message（img onerror）以字面文本显示",
        a.text.includes(P.imgOnerror),
        a.text.slice(0, 120)
    );
    check("无 #inj 注入元素", !a.html.includes('id="inj"'), "含 id=inj");

    // 恶意 icon 只能落到安全 class
    const cls = await evalJs(`(() => {
        const i = document.querySelector(".bubble-container .bubble-btn .bubble-content i");
        return i ? i.className : "(no i)";
    })()`);
    check(
        "恶意 icon 不进入 class（仅安全 token）",
        ICON_CLASS_RE.test(cls),
        cls
    );
    check(
        "恶意 icon 未突破属性（class 中无引号/尖括号）",
        !/["'<>=\s]/.test(cls.replace(/^fas fa-/, "")),
        cls
    );
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例2] 按钮编辑表单：恶意 message 经 value 回显");
await injectAndLoad("index.html", {
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "quick_online", message: P.attrBreak, icon: "bolt" },
            { id: "emergency", message: P.eventAttrSingle, icon: "bell" },
        ],
        activeGroup: "default",
    }),
});
await openModal();

{
    const a = await audit("#buttonEditModal");
    checkNoInjection("编辑弹窗", a);

    const v1 = await evalJs(`(() => {
        const el = document.getElementById("button1Text");
        return el ? el.value : "(missing)";
    })()`);
    check(
        "表单 value 完整回显恶意 message（未被截断/逃逸）",
        v1 === P.attrBreak,
        JSON.stringify(v1)
    );

    const v2 = await evalJs(`(() => {
        const el = document.getElementById("button2Text");
        return el ? el.value : "(missing)";
    })()`);
    check(
        "表单 value 完整回显单引号载荷",
        v2 === P.eventAttrSingle,
        JSON.stringify(v2)
    );

    const attrs = await evalJs(`(() => {
        const el = document.getElementById("button1Text");
        if (!el) return "(missing)";
        return JSON.stringify(Array.from(el.attributes).map(a => a.name));
    })()`);
    check(
        "文本 input 未被注入额外属性",
        !/on/i.test(attrs) && !attrs.includes("onfocus"),
        attrs
    );

    const inpCount = await evalJs(
        `document.querySelectorAll("#defaultButtonsArea input.btn-text").length`
    );
    check("默认按钮表单各含 1 个文本输入", inpCount === 2, String(inpCount));
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例3] 图标选择器：恶意 icon 不注入任意 class / 属性");
// 本用例必须独立注入恶意 icon —— 不能复用上一用例的合法配置，
// 否则断言只会跑在 `bolt`/`bell` 上，形成"看起来通过"的覆盖盲区。
await injectAndLoad("index.html", {
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "quick_online", message: "恶意图标按钮", icon: ICON_P.attrBreak },
            { id: "emergency", message: "正常按钮", icon: "bell" },
        ],
        activeGroup: "default",
    }),
});
{
    // 首页渲染阶段：恶意 icon 必须先被拦下
    const homeCls = await evalJs(`(() => {
        const i = document.querySelector(".bubble-container .bubble-btn .bubble-content i");
        return i ? i.className : "(no i)";
    })()`);
    check(
        "首页：恶意 icon 被替换为安全值（非原样拼接）",
        homeCls === "fas fa-random",
        homeCls
    );

    await openModal();

    const idVal = await evalJs(`(() => {
        const p = document.getElementById("button1Icon");
        return p ? p.dataset.value : "(missing)";
    })()`);
    check(
        "图标选择器 dataset.value 为安全 token 或 random",
        idVal === "random" || ICON_TOKEN_RE.test(idVal),
        idVal
    );
    check(
        "恶意 icon 未落入 dataset.value（回退为 random）",
        idVal === "random",
        idVal
    );

    const iconClasses = JSON.parse(
        await evalJs(`(() => {
            const p = document.getElementById("button1Icon");
            if (!p) return JSON.stringify(null);
            return JSON.stringify({
                trigger: p.querySelector(".icon-picker-trigger i").className,
                caret: p.querySelector(".icon-picker-caret").className,
                options: Array.from(p.querySelectorAll(".icon-picker-option i"))
                    .map(i => i.className),
            });
        })()`)
    );
    check(
        "触发按钮图标 class 为安全图标名",
        iconClasses && ICON_CLASS_RE.test(iconClasses.trigger),
        JSON.stringify(iconClasses && iconClasses.trigger)
    );
    check(
        "下拉箭头 class 保持既有值",
        iconClasses && iconClasses.caret === "fas fa-chevron-down icon-picker-caret",
        JSON.stringify(iconClasses && iconClasses.caret)
    );
    check(
        "全部选项图标 class 均为安全图标名",
        iconClasses &&
            iconClasses.options.length > 0 &&
            iconClasses.options.every(c => ICON_CLASS_RE.test(c)),
        JSON.stringify(iconClasses && iconClasses.options)
    );

    // 任一 <i> 的 class 都必须匹配"安全图标名（可带 caret 后缀）"这一唯一形态
    // 注意：容器缺失时返回哨兵值而不是抛异常 —— 回退版本会让选择器结构崩掉，
    // 这里必须把"崩了"变成一条可读的 FAIL，而不是中断整个脚本。
    const anyBadIcon = await evalJs(`(() => {
        const p = document.getElementById("button1Icon");
        if (!p) return JSON.stringify(["(no picker)"]);
        const bad = [];
        p.querySelectorAll("i").forEach(i => {
            const ok = /^fas fa-[a-z0-9-]+( icon-picker-caret)?$/.test(i.className);
            if (!ok) bad.push(i.className);
        });
        return JSON.stringify(bad);
    })()`);
    check("无任何 <i> 的 class 携带注入片段", anyBadIcon === "[]", anyBadIcon);
}

// 保存后不应把恶意串写进存储
{
    const saved = await evalJsSafe(`(() => {
        document.getElementById("saveButtons").click();
        const raw = localStorage.getItem("buttonConfig");
        return raw;
    })()`);
    check("含恶意 icon 的配置保存不抛异常", saved.ok === true, saved.ok ? "" : saved.error);
    if (saved.ok) {
        const cfg = JSON.parse(saved.value);
        const icons = (cfg.buttons || []).map(b => b.icon);
        check(
            "保存后 icon 全部为安全 token",
            icons.every(i => typeof i === "string" && ICON_TOKEN_RE.test(i)),
            JSON.stringify(icons)
        );
        check(
            "保存后恶意 icon 已被规范化为 random（不落库原始载荷）",
            icons[0] === "random",
            JSON.stringify(icons)
        );
        check(
            "保存后 icon 字面量不含注入字符",
            icons.every(i => !/["'<>\s/=]/.test(i)),
            JSON.stringify(icons)
        );
    }
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例4] 自定义按钮表单：恶意 message 与 icon");
await injectAndLoad("index.html", {
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "quick_online", message: "默认一", icon: "bolt" },
            { id: "emergency", message: "默认二", icon: "bell" },
            {
                id: "custom_1700000000900",
                message: P.structBreak,
                icon: ICON_P.withSpace,
            },
        ],
        activeGroup: "default",
    }),
});
await openModal();

{
    const a = await audit("#buttonEditModal");
    checkNoInjection("含自定义按钮的编辑弹窗", a);

    const cnt = await evalJs(
        `document.querySelectorAll(".custom-button-form").length`
    );
    check("渲染 1 个自定义按钮表单", cnt === 1, String(cnt));

    const cv = await evalJs(`(() => {
        const f = document.querySelector(".custom-button-form");
        return f ? f.querySelector(".btn-text").value : "(missing)";
    })()`);
    check(
        "自定义表单 value 完整回显结构注入载荷",
        cv === P.structBreak,
        JSON.stringify(cv)
    );

    const labelCount = await evalJs(`(() => {
        const f = document.querySelector(".custom-button-form");
        return f ? f.querySelectorAll(".form-header label").length : -1;
    })()`);
    check("自定义表单标签未被结构注入破坏", labelCount === 1, String(labelCount));
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例5] 历史渲染：恶意 nickname / message / emoji / webhook");
await injectAndLoad("history.html", {
    [ONB]: "true",
    notificationHistory: JSON.stringify([
        {
            timestamp: "2026-09-17T10:00:00.000Z",
            message: P.imgOnerror,
            nickname: P.scriptTag,
            emoji: P.svgOnload,
            _status: "error",
            webhook: P.attrBreak,
        },
    ]),
});

{
    const a = await audit("#historyList");
    const n = await evalJs(`document.querySelectorAll("#historyList .history-item").length`);
    check("历史渲染 1 条记录", n === 1, String(n));
    checkNoInjection("历史列表", a);
    check("历史列表无 #inj 注入元素", !a.html.includes('id="inj"'), "含 id=inj");

    const fields = await evalJs(`(() => {
        const item = document.querySelector("#historyList .history-item");
        if (!item) return JSON.stringify({ missing: true });
        const q = s => { const el = item.querySelector(s); return el ? el.textContent : "(missing)"; };
        return JSON.stringify({
            name: q(".history-name"),
            msg: q(".history-message"),
            emoji: q(".history-emoji"),
            err: q(".history-error"),
        });
    })()`);
    const f = JSON.parse(fields);
    check("恶意 nickname 以字面文本显示", f.name === P.scriptTag, JSON.stringify(f.name));
    check("恶意 message 以字面文本显示", f.msg === P.imgOnerror, JSON.stringify(f.msg));
    check("恶意 emoji 以字面文本显示", f.emoji === P.svgOnload, JSON.stringify(f.emoji));
    check(
        "恶意 webhook 以字面文本显示（error 态）",
        f.err === `Webhook: ${P.attrBreak}`,
        JSON.stringify(f.err)
    );
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例6] 历史 _status：未知值不突破 class，success/error 不回归");
await injectAndLoad("history.html", {
    [ONB]: "true",
    notificationHistory: JSON.stringify([
        {
            timestamp: "2026-09-17T10:00:00.000Z",
            message: "恶意状态",
            nickname: "甲",
            emoji: "👤",
            _status: 'error" onload="window.__pwned=1',
            webhook: "http://x.invalid",
        },
        {
            timestamp: "2026-09-17T10:01:00.000Z",
            message: "合法错误",
            nickname: "乙",
            emoji: "👤",
            _status: "error",
            webhook: "http://example.invalid/hook",
        },
        {
            timestamp: "2026-09-17T10:02:00.000Z",
            message: "合法成功",
            nickname: "丙",
            emoji: "👤",
            _status: "success",
            webhook: "http://example.invalid/hook",
        },
        {
            timestamp: "2026-09-17T10:03:00.000Z",
            message: "状态缺失",
            nickname: "丁",
            emoji: "👤",
        },
    ]),
});

{
    const a = await audit("#historyList");
    checkNoInjection("历史列表（含恶意 _status）", a);

    const classes = JSON.parse(
        await evalJs(`JSON.stringify(
            Array.from(document.querySelectorAll("#historyList .history-item"))
                .map(el => el.className)
        )`)
    );
    check("历史渲染 4 条记录", classes.length === 4, JSON.stringify(classes));
    check(
        "未知 _status 不产生状态 class（仅 history-item）",
        classes[0] === "history-item",
        JSON.stringify(classes[0])
    );
    check(
        "合法 error 仍为 history-item error",
        classes[1] === "history-item error",
        JSON.stringify(classes[1])
    );
    check(
        "合法 success 仍为 history-item success",
        classes[2] === "history-item success",
        JSON.stringify(classes[2])
    );
    check(
        "_status 缺失时不产生状态 class",
        classes[3] === "history-item",
        JSON.stringify(classes[3])
    );

    const errBlocks = await evalJs(
        `document.querySelectorAll("#historyList .history-error").length`
    );
    check(
        "仅合法 error 记录显示 Webhook 行（2 条 → 1 条）",
        errBlocks === 1,
        String(errBlocks)
    );

    const unknownClass = classes[0];
    check(
        "未知 _status 未把任意字符串带进 class",
        !unknownClass.includes("onload") && !unknownClass.includes('"'),
        unknownClass
    );
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例7] 合法数据不回归：图标渲染 / 文本 / 随机图标");
await injectAndLoad("index.html", {
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "quick_online", message: "合法按钮一", icon: "fire" },
            { id: "emergency", message: "合法按钮二", icon: "random" },
            {
                id: "custom_1700000000100",
                message: "合法自定义",
                icon: "star",
            },
        ],
        activeGroup: "default",
    }),
});

{
    const icons = JSON.parse(
        await evalJs(`JSON.stringify(
            Array.from(document.querySelectorAll(".bubble-container .bubble-btn .bubble-content i"))
                .map(i => i.className)
        )`)
    );
    check("合法 icon fire 渲染为 fas fa-fire", icons[0] === "fas fa-fire", JSON.stringify(icons[0]));
    check(
        "合法 icon random 保持既有渲染 fas fa-random",
        icons[1] === "fas fa-random",
        JSON.stringify(icons[1])
    );
    check("合法 icon star 渲染为 fas fa-star", icons[2] === "fas fa-star", JSON.stringify(icons[2]));

    const texts = JSON.parse(
        await evalJs(`JSON.stringify(
            Array.from(document.querySelectorAll(".bubble-container .bubble-btn .bubble-content span"))
                .map(s => s.textContent)
        )`)
    );
    check(
        "合法按钮文案完整显示",
        texts[0] === "合法按钮一" && texts[1] === "合法按钮二" && texts[2] === "合法自定义",
        JSON.stringify(texts)
    );

    const clickable = await evalJs(`(() => {
        const btns = document.querySelectorAll(".bubble-container .bubble-btn");
        return JSON.stringify(Array.from(btns).map(b => b.getAttribute("data-button-index")));
    })()`);
    check(
        "按钮 data-button-index 完整（可点击前提）",
        clickable === '["0","1","2"]',
        clickable
    );

    // 图标选择器：合法 icon 正确回显
    await openModal();
    const picker = JSON.parse(
        await evalJs(`(() => {
            const p = document.getElementById("button1Icon");
            if (!p) return JSON.stringify(null);
            const sel = p.querySelector(".icon-picker-option.selected");
            return JSON.stringify({
                value: p.dataset.value,
                trigger: p.querySelector(".icon-picker-trigger i").className,
                selectedValue: sel ? sel.dataset.value : null,
            });
        })()`)
    );
    check("合法 icon 在选择器中回显 dataset.value=fire", picker && picker.value === "fire", JSON.stringify(picker));
    check("合法 icon 触发按钮 class 为 fas fa-fire", picker && picker.trigger === "fas fa-fire", JSON.stringify(picker));
    check("合法 icon 在菜单中标记 selected", picker && picker.selectedValue === "fire", JSON.stringify(picker));

    const a = await audit("#buttonEditModal");
    checkNoInjection("合法数据下的编辑弹窗", a);
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例8] 页面异常检查");
check("全流程无未捕获异常 / console.error", pageErrors.length === 0, pageErrors.join(" | "));

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
