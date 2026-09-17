// CM-004 按钮 ID 兼容规则 — 回归验证脚本（可复现）
//
// 运行方式：
//   node tools/button-ids.mjs
//
// 本脚本自带静态服务器（与 Chrome 同进程），无需另开终端。
// 也支持复用外部服务器：设置 CM004_NO_SERVER=1 并用 CM004_BASE 指定地址。
//
// 依赖：仅 Node 内置模块 + 本机 Chrome。不引入任何 npm 依赖。
//
// 本机环境注意（与前序脚本同因）：
//   - HTTP_PROXY 会劫持回环请求 → Chrome 带 --no-proxy-server --proxy-bypass-list=<-loopback>
//   - 探针用 node:http 直连，不能用 fetch
//   - 静态服务器必须与浏览器同进程，否则子进程被回收
//
// 覆盖任务卡 ACCEPTANCE CRITERIA：
//   - 新配置保存后默认按钮 ID 为 quick_online / emergency
//   - 旧 default_N 配置可读取/显示/编辑/保存，且内容不丢
//   - 旧 custom_timestamp 配置编辑保存后原 ID 不变
//   - 新建自定义按钮获得唯一持久 ID，连续保存与刷新后不变
//   - 删除其他按钮、默认按钮编辑路径不牵连未编辑按钮的 ID
//   - 未知字段保留
//   - 现有新增/编辑/删除/渲染行为不回归
import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVE_PORT = Number(process.env.CM004_PORT || 8899);
const EXTERNAL = process.env.CM004_NO_SERVER === "1";
const BASE = process.env.CM004_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.CM004_CDP_PORT || 9446);
const CHROME =
    process.env.CM004_CHROME ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = path.join(os.tmpdir(), "cm004-button-ids-profile");
const LOG_PATH = process.env.CM004_LOG || "";

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

log("=== CM-004 按钮 ID 兼容规则回归验证 ===");
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
log("  断言模式 : CM-004 按钮 ID 兼容");
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

/**
 * 注入 storage 后加载首页。
 *
 * 先 `localStorage.clear()` 再按 pairs 写入 —— 每个用例都从干净状态起步，
 * 这样用例之间不互相污染，脚本可重复运行（Chrome profile 目录跨运行复用）。
 * 传 `buttonConfig: null` 表示"刻意不写入该 key"（用于验证无配置路径）。
 */
async function injectAndLoad(pairs) {
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
    await goto(BASE + "/index.html");
}

/** 读取当前存储的 buttonConfig（已解析） */
async function readCfg() {
    const r = await evalJs(`(() => {
        const raw = localStorage.getItem("buttonConfig");
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        return JSON.stringify({ raw, parsed });
    })()`);
    return JSON.parse(r);
}

/** 打开编辑弹窗 */
async function openModal() {
    return evalJs(`(() => {
        const btn = document.getElementById("editButtons");
        if (!btn) return "no #editButtons";
        btn.click();
        const m = document.getElementById("buttonEditModal");
        return m && m.classList.contains("show") ? "ok" : "modal not shown";
    })()`);
}

/** 保存并返回存储结果 */
async function saveAndRead() {
    return evalJsSafe(`(() => {
        document.getElementById("saveButtons").click();
        const raw = localStorage.getItem("buttonConfig");
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        return JSON.stringify({ raw, parsed });
    })()`);
}

// ─────────────────────────────────────────────────────────
log("[用例1] 新配置保存后默认按钮 ID = 规范 ID");
// 不注入 buttonConfig（null），让 loadButtonConfig 走"无配置 → 落盘默认"路径。
await injectAndLoad({ [ONB]: "true", buttonConfig: null });

{
    const pre = await readCfg();
    const preIds = (pre.parsed?.buttons || []).map(b => b.id);
    check(
        "无配置时自动落盘规范 ID 默认按钮",
        preIds[0] === "quick_online" && preIds[1] === "emergency",
        JSON.stringify(preIds)
    );

    const opened = await openModal();
    check("编辑窗口可打开", opened === "ok", String(opened));
    const saved = await saveAndRead();
    check("保存动作不抛异常", saved.ok === true, saved.ok ? "" : saved.error);
    if (saved.ok) {
        const d = JSON.parse(saved.value);
        const ids = (d.parsed?.buttons || []).map(b => b.id);
        check(
            "保存后默认按钮 ID 为 quick_online / emergency",
            ids[0] === "quick_online" && ids[1] === "emergency",
            JSON.stringify(ids)
        );
        check(
            "不再出现按位置生成的 default_N",
            !ids.some(id => String(id).startsWith("default_")),
            JSON.stringify(ids)
        );
        check(
            "默认按钮内容来自 CONFIG",
            d.parsed?.buttons?.[0]?.message?.includes("呼叫") &&
                d.parsed?.buttons?.[1]?.message?.includes("堡垒"),
            JSON.stringify(d.parsed?.buttons)
        );
    } else {
        check("保存后默认按钮 ID 为 quick_online / emergency", false, "上一步已抛异常");
        check("不再出现按位置生成的 default_N", false, "上一步已抛异常");
        check("默认按钮内容来自 CONFIG", false, "上一步已抛异常");
    }
    check("用例1 无未捕获异常", pageErrors.length === 0, pageErrors.join(" | "));
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例2] 含 legacy default_N 的旧配置：读取 → 归一化 → 编辑保存内容不丢");
await injectAndLoad({
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "default_1", message: "旧按钮一", icon: "bell" },
            { id: "default_2", message: "旧按钮二", icon: "heart" },
        ],
        activeGroup: "default",
    }),
});

{
    // 读取阶段：ID 应已归一化（在内存中），文案保留
    const cfg1 = await readCfg();
    check(
        "legacy 配置读取无未捕获异常",
        pageErrors.length === 0,
        pageErrors.join(" | ")
    );
    check(
        "读取阶段未静默改写存储（仍是 legacy ID）",
        JSON.parse(cfg1.raw).buttons[0].id === "default_1",
        JSON.stringify(JSON.parse(cfg1.raw).buttons.map(b => b.id))
    );

    // 首页渲染应显示旧文案（内容不丢）
    const rendered = await evalJs(`(() => {
        const btns = document.querySelectorAll(".bubble-container .bubble-btn");
        return JSON.stringify({ count: btns.length, texts: [...btns].map(b => (b.innerText || "").trim()) });
    })()`);
    const rd = JSON.parse(rendered);
    check("legacy 配置渲染 2 个按钮", rd.count === 2, JSON.stringify(rd));
    check(
        "legacy 按钮文案完整保留",
        rd.texts.some(t => t.includes("旧按钮一")) &&
            rd.texts.some(t => t.includes("旧按钮二")),
        JSON.stringify(rd.texts)
    );

    // 打开编辑 → 保存：ID 归一化为规范 ID，内容保留
    await openModal();
    const saved = await saveAndRead();
    check("legacy 配置保存不抛异常", saved.ok === true, saved.ok ? "" : saved.error);
    if (saved.ok) {
        const d = JSON.parse(saved.value);
        const b = d.parsed?.buttons || [];
        check(
            "保存后 legacy ID 迁移为规范 ID",
            b[0]?.id === "quick_online" && b[1]?.id === "emergency",
            JSON.stringify(b.map(x => x.id))
        );
        check(
            "迁移后文案不丢",
            b[0]?.message === "旧按钮一" && b[1]?.message === "旧按钮二",
            JSON.stringify(b)
        );
        check(
            "迁移后图标不丢",
            b[0]?.icon === "bell" && b[1]?.icon === "heart",
            JSON.stringify(b)
        );
    } else {
        check("保存后 legacy ID 迁移为规范 ID", false, "上一步已抛异常");
        check("迁移后文案不丢", false, "上一步已抛异常");
        check("迁移后图标不丢", false, "上一步已抛异常");
    }
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例3] legacy custom_timestamp 旧配置：编辑保存后原 ID 不变");
const LEGACY_CUSTOM_ID = "custom_1700000000000";
const LEGACY_CUSTOM_ID2 = "custom_1700000000001";
await injectAndLoad({
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "default_1", message: "默认一", icon: "bolt" },
            { id: "default_2", message: "默认二", icon: "exclamation-triangle" },
            { id: LEGACY_CUSTOM_ID, message: "老自定义A", icon: "star" },
            { id: LEGACY_CUSTOM_ID2, message: "老自定义B", icon: "fire" },
        ],
        activeGroup: "default",
    }),
});

{
    await openModal();
    // 只改第一个自定义按钮的文案，第二个完全不动
    const edited = await evalJs(`(() => {
        const forms = document.querySelectorAll("#customButtonsArea .custom-button-form");
        if (forms.length < 2) return "forms<2: " + forms.length;
        forms[0].querySelector(".btn-text").value = "老自定义A-已改";
        return "ok";
    })()`);
    check("自定义表单渲染 2 个", edited === "ok", String(edited));

    const saved = await saveAndRead();
    check("legacy custom 配置保存不抛异常", saved.ok === true, saved.ok ? "" : saved.error);
    if (saved.ok) {
        const d = JSON.parse(saved.value);
        const b = d.parsed?.buttons || [];
        const cs = b.filter(x => String(x.id).startsWith("custom_"));
        check(
            "编辑后的自定义按钮保留原 legacy ID",
            cs[0]?.id === LEGACY_CUSTOM_ID,
            JSON.stringify(cs.map(x => x.id))
        );
        check(
            "被编辑的按钮文案已更新",
            cs[0]?.message === "老自定义A-已改",
            JSON.stringify(cs[0])
        );
        check(
            "未编辑的自定义按钮 ID 完全不变",
            cs[1]?.id === LEGACY_CUSTOM_ID2,
            JSON.stringify(cs.map(x => x.id))
        );
        check(
            "未编辑的自定义按钮内容不变",
            cs[1]?.message === "老自定义B" && cs[1]?.icon === "fire",
            JSON.stringify(cs[1])
        );
    } else {
        check("编辑后的自定义按钮保留原 legacy ID", false, "上一步已抛异常");
        check("被编辑的按钮文案已更新", false, "上一步已抛异常");
        check("未编辑的自定义按钮 ID 完全不变", false, "上一步已抛异常");
        check("未编辑的自定义按钮内容不变", false, "上一步已抛异常");
    }
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例4] 新建自定义按钮：唯一持久 ID；连续保存 / 刷新后不变");
// 不写 buttonConfig（null = 刻意不注入），从"零自定义按钮"起步。
await injectAndLoad({ [ONB]: "true", buttonConfig: null });

{
    // 一次新增两个按钮 → 同一批次内 ID 必须不同
    await openModal();
    const baseline = await evalJs(
        `document.querySelectorAll("#customButtonsArea .custom-button-form").length`
    );
    check("起始状态无自定义按钮", baseline === 0, String(baseline));

    const added = await evalJs(`(() => {
        document.getElementById("addCustomButton").click();
        document.getElementById("addCustomButton").click();
        const forms = document.querySelectorAll("#customButtonsArea .custom-button-form");
        forms[0].querySelector(".btn-text").value = "新按钮X";
        forms[1].querySelector(".btn-text").value = "新按钮Y";
        return String(forms.length);
    })()`);
    check("可连续新增 2 个自定义按钮", added === "2", added);

    const saved = await saveAndRead();
    check("新建按钮保存不抛异常", saved.ok === true, saved.ok ? "" : saved.error);
    let firstIds = [];
    if (saved.ok) {
        const d = JSON.parse(saved.value);
        const cs = (d.parsed?.buttons || []).filter(x =>
            String(x.id).startsWith("custom_")
        );
        firstIds = cs.map(x => x.id);
        check("新建自定义按钮数量为 2", cs.length === 2, JSON.stringify(cs));
        check(
            "同一批次两个新按钮 ID 互不相同",
            firstIds.length === 2 && firstIds[0] !== firstIds[1],
            JSON.stringify(firstIds)
        );
        check(
            "新按钮 ID 带 custom_ 前缀",
            firstIds.every(id => String(id).startsWith("custom_")),
            JSON.stringify(firstIds)
        );
    } else {
        check("新建自定义按钮数量为 2", false, "上一步已抛异常");
        check("同一批次两个新按钮 ID 互不相同", false, "上一步已抛异常");
        check("新按钮 ID 带 custom_ 前缀", false, "上一步已抛异常");
    }

    // 连续保存（不改任何东西）→ ID 必须不变
    await openModal();
    const saved2 = await saveAndRead();
    check("连续保存不抛异常", saved2.ok === true, saved2.ok ? "" : saved2.error);
    if (saved2.ok && firstIds.length === 2) {
        const d2 = JSON.parse(saved2.value);
        const ids2 = (d2.parsed?.buttons || [])
            .filter(x => String(x.id).startsWith("custom_"))
            .map(x => x.id);
        check(
            "连续保存后 ID 不变",
            ids2.length === 2 && ids2[0] === firstIds[0] && ids2[1] === firstIds[1],
            JSON.stringify({ before: firstIds, after: ids2 })
        );
    } else {
        check("连续保存后 ID 不变", false, "前置步骤失败");
    }

    // 刷新后再次保存 → ID 仍不变
    pageErrors = [];
    await goto(BASE + "/index.html");
    check("刷新后无未捕获异常", pageErrors.length === 0, pageErrors.join(" | "));
    await openModal();
    const saved3 = await saveAndRead();
    if (saved3.ok && firstIds.length === 2) {
        const d3 = JSON.parse(saved3.value);
        const ids3 = (d3.parsed?.buttons || [])
            .filter(x => String(x.id).startsWith("custom_"))
            .map(x => x.id);
        check(
            "刷新后再次保存 ID 仍不变",
            ids3.length === 2 && ids3[0] === firstIds[0] && ids3[1] === firstIds[1],
            JSON.stringify({ before: firstIds, after: ids3 })
        );
    } else {
        check("刷新后再次保存 ID 仍不变", false, "前置步骤失败");
    }
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例5] 删除其他按钮 / 编辑默认按钮，不牵连未编辑自定义按钮的 ID");
await injectAndLoad({
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "quick_online", message: "默认一", icon: "bolt" },
            { id: "emergency", message: "默认二", icon: "exclamation-triangle" },
            { id: "custom_1700000000001", message: "存活A", icon: "star" },
            { id: "custom_1700000000002", message: "待删除B", icon: "fire" },
            { id: "custom_1700000000003", message: "存活C", icon: "bell" },
        ],
        activeGroup: "default",
    }),
});

{
    await openModal();
    const acted = await evalJs(`(() => {
        // 编辑默认按钮1 的图标
        const p = document.getElementById("button1Icon");
        p.querySelector(".icon-picker-trigger").click();
        p.querySelector('.icon-picker-option[data-value="bell"]').click();
        // 删除第 2 个自定义按钮（待删除B）
        const forms = document.querySelectorAll("#customButtonsArea .custom-button-form");
        if (forms.length < 3) return "forms<3: " + forms.length;
        forms[1].querySelector(".remove-btn").click();
        return "ok";
    })()`);
    check("可编辑默认按钮并删除中间自定义按钮", acted === "ok", String(acted));

    const saved = await saveAndRead();
    check("用例5 保存不抛异常", saved.ok === true, saved.ok ? "" : saved.error);
    if (saved.ok) {
        const d = JSON.parse(saved.value);
        const b = d.parsed?.buttons || [];
        const cs = b.filter(x => String(x.id).startsWith("custom_"));
        check(
            "删除后剩余 2 个自定义按钮",
            cs.length === 2,
            JSON.stringify(cs.map(x => x.id))
        );
        check(
            "被删按钮已移除",
            !cs.some(x => x.message === "待删除B"),
            JSON.stringify(cs)
        );
        check(
            "存活按钮 ID 未被连带改变（A 与 C）",
            cs[0]?.id === "custom_1700000000001" &&
                cs[1]?.id === "custom_1700000000003",
            JSON.stringify(cs.map(x => x.id))
        );
        check(
            "默认按钮编辑后 ID 仍为规范 ID",
            b[0]?.id === "quick_online" && b[0]?.icon === "bell",
            JSON.stringify(b[0])
        );
    } else {
        check("删除后剩余 2 个自定义按钮", false, "上一步已抛异常");
        check("被删按钮已移除", false, "上一步已抛异常");
        check("存活按钮 ID 未被连带改变（A 与 C）", false, "上一步已抛异常");
        check("默认按钮编辑后 ID 仍为规范 ID", false, "上一步已抛异常");
    }
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例6] 未知字段保留策略");
await injectAndLoad({
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "default_1", message: "带额外字段的默认按钮", icon: "bolt", color: "#ff0000", weight: 7 },
            { id: "emergency", message: "普通默认按钮", icon: "exclamation-triangle" },
            { id: "custom_1700000000009", message: "带额外字段的自定义", icon: "star", tag: "vip", nested: { a: 1 } },
        ],
        activeGroup: "default",
    }),
});

{
    await openModal();
    const saved = await saveAndRead();
    check("未知字段用例保存不抛异常", saved.ok === true, saved.ok ? "" : saved.error);
    if (saved.ok) {
        const d = JSON.parse(saved.value);
        const b = d.parsed?.buttons || [];
        check(
            "默认按钮未知字段 color/weight 被保留",
            b[0]?.color === "#ff0000" && b[0]?.weight === 7,
            JSON.stringify(b[0])
        );
        check(
            "自定义按钮未知字段 tag/nested 被保留",
            b[2]?.tag === "vip" && b[2]?.nested?.a === 1,
            JSON.stringify(b[2])
        );
        check(
            "已知字段仍按表单值写入（id 归一化）",
            b[0]?.id === "quick_online" && b[0]?.message === "带额外字段的默认按钮",
            JSON.stringify(b[0])
        );
    } else {
        check("默认按钮未知字段 color/weight 被保留", false, "上一步已抛异常");
        check("自定义按钮未知字段 tag/nested 被保留", false, "上一步已抛异常");
        check("已知字段仍按表单值写入（id 归一化）", false, "上一步已抛异常");
    }
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例7] 回归：现有新增 / 编辑 / 删除 / 渲染 / 点击行为");
await injectAndLoad({ [ONB]: "true" });

{
    // 新增 → 选图标 → 保存
    await openModal();
    const flow = await evalJs(`(() => {
        document.getElementById("addCustomButton").click();
        const form = document.querySelectorAll("#customButtonsArea .custom-button-form")[0];
        form.querySelector(".btn-text").value = "回归按钮";
        const p = form.querySelector(".icon-picker");
        p.querySelector(".icon-picker-trigger").click();
        p.querySelector('.icon-picker-option[data-value="fire"]').click();
        const pickValue = p.dataset.value;
        document.getElementById("saveButtons").click();
        const cfg = JSON.parse(localStorage.getItem("buttonConfig"));
        const c = cfg.buttons.filter(b => String(b.id).startsWith("custom_")).pop();
        return JSON.stringify({ pickValue, saved: c, total: cfg.buttons.length });
    })()`);
    const fd = JSON.parse(flow);
    check("自定义按钮新增并选择图标 fire", fd.pickValue === "fire", String(fd.pickValue));
    check("保存后图标持久化为 fire", fd.saved?.icon === "fire", JSON.stringify(fd.saved));
    check("总数 = 2 默认 + 1 自定义", fd.total === 3, String(fd.total));

    // 重新打开 → 回显
    const reopen = await evalJs(`(() => {
        document.getElementById("editButtons").click();
        const form = document.querySelectorAll("#customButtonsArea .custom-button-form")[0];
        const p = form.querySelector(".icon-picker");
        return JSON.stringify({
            text: form.querySelector(".btn-text").value,
            value: p.dataset.value,
            trigger: p.querySelector(".icon-picker-trigger i").className
        });
    })()`);
    const rj = JSON.parse(reopen);
    check("重新打开文字回显正确", rj.text === "回归按钮", String(rj.text));
    check("重新打开图标回显 fire", rj.value === "fire", String(rj.value));
    check("重新打开 trigger = fa-fire", String(rj.trigger).includes("fa-fire"), String(rj.trigger));

    // 渲染与点击
    const rendered = await evalJs(`(() => {
        document.getElementById("closeButtonEdit").click();
        const btns = [...document.querySelectorAll(".bubble-container .bubble-btn")];
        return JSON.stringify({
            count: btns.length,
            hasCustom: btns.some(b => (b.innerText || "").includes("回归按钮")),
            hasClickHandler: btns.every(b => b.getAttribute("data-button-index") !== null)
        });
    })()`);
    const rn = JSON.parse(rendered);
    check("首页渲染 3 个按钮", rn.count === 3, String(rn.count));
    check("自定义按钮文案出现在首页", rn.hasCustom === true, JSON.stringify(rn));
    check("按钮均可点击（index 属性完整）", rn.hasClickHandler === true, JSON.stringify(rn));

    // 状态检查间隔异常
    check("用例7 无未捕获异常", pageErrors.length === 0, pageErrors.join(" | "));
}

// ─────────────────────────────────────────────────────────
log("");
log("[用例8] 幂等性：规范 ID 配置反复保存不产生漂移");
await injectAndLoad({
    [ONB]: "true",
    buttonConfig: JSON.stringify({
        buttons: [
            { id: "quick_online", message: "规范一", icon: "bolt" },
            { id: "emergency", message: "规范二", icon: "exclamation-triangle" },
            { id: "custom_1700000000050", message: "自定义", icon: "star" },
        ],
        activeGroup: "default",
    }),
});

{
    let prev = null;
    let stable = true;
    let details = [];
    for (let i = 0; i < 3; i++) {
        await openModal();
        const s = await saveAndRead();
        if (!s.ok) {
            check(`第 ${i + 1} 次保存不抛异常`, false, s.error);
            stable = false;
            break;
        }
        const ids = (JSON.parse(s.value).parsed?.buttons || []).map(x => x.id);
        details.push(ids.join(","));
        if (prev && prev !== ids.join(",")) stable = false;
        prev = ids.join(",");
    }
    check(
        "连续 3 次保存 ID 序列完全稳定",
        stable,
        JSON.stringify(details)
    );
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
