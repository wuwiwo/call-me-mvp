// CM-002 端到端验证脚本（可复现）
//
// 运行方式：
//   node tools/e2e.mjs
//
// 本脚本**自带静态服务器**（与 Chrome 同进程启动），无需另开终端。
// 也可复用外部服务器：设置 CM002_NO_SERVER=1 并先跑 `node tools/server.mjs`。
//
// 为什么改成自带服务器（CM-003/CM-004 的教训）：
//   本机子进程不能跨 Bash 命令存活。单独一条命令后台起 server.mjs，
//   下一条命令里端口就没了 —— 症状是页面停在 chrome-error://chromewebdata/，
//   而报错却是 SecurityError（误导性极强）。把服务器内联进本进程即可根除。
//
// 依赖：仅 Node 内置模块（node:http / node:child_process / node:fs）+ 本机 Chrome。
// 不引入任何 npm 依赖，符合 AGENTS.md「不引入大型依赖」要求。
//
// 本机环境注意：HTTP_PROXY 会劫持回环请求，故
//   - Chrome 需带 --no-proxy-server --proxy-bypass-list=<-loopback>
//   - 探针必须用 node:http 直连，不能用 fetch
import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, mkdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChrome } from "./chrome-path.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVE_PORT = Number(process.env.CM002_PORT || 8899);
const EXTERNAL = process.env.CM002_NO_SERVER === "1";
const BASE = process.env.CM002_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.CM002_CDP_PORT || 9444);
// Chrome 路径解析已统一到 tools/chrome-path.mjs（CM-009）：
// CM002_CHROME > CHROME_PATH > 常见安装位置 > which
const CHROME = resolveChrome(process.env.CM002_CHROME);
const PROFILE = path.join(os.tmpdir(), "cm002-e2e-profile");

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

if (!EXTERNAL) {
    await startStaticServer();
}

// 绕开本机代理
const cleanEnv = { ...process.env };
for (const k of Object.keys(cleanEnv)) {
    if (/proxy/i.test(k)) delete cleanEnv[k];
}
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

console.log("=== CM-002 端到端验证 ===\n");
console.log("[环境]");
console.log("  测试 URL :", BASE);
console.log("  Chrome   :", CHROME);
console.log("  CDP 端口 :", CDP_PORT);
console.log("  profile  :", PROFILE);

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
console.log("  浏览器   :", ver.Browser);
console.log("  UA       :", ver["User-Agent"]);
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
    for (let i = 0; i < 60; i++) {
        try {
            if ((await evalJs("document.readyState")) === "complete") break;
        } catch {
            /* navigating */
        }
        await new Promise(r => setTimeout(r, 150));
    }
    await new Promise(r => setTimeout(r, 500));
}

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

// 对齐验收标准的手工步骤，逐条脚本化
await goto(BASE + "/index.html");
await evalJs(
    'localStorage.clear(); localStorage.setItem("onboardingCompleted","true"); true'
);
await goto(BASE + "/index.html");

console.log("[步骤1] 打开编辑窗口");
const opened = await evalJs(`(() => {
    const btn = document.getElementById("editButtons");
    if (!btn) return "no #editButtons";
    btn.click();
    const m = document.getElementById("buttonEditModal");
    return m && m.classList.contains("show") ? "ok" : "modal not shown";
})()`);
check("编辑窗口成功打开", opened === "ok", String(opened));

console.log("\n[步骤2] 新增自定义按钮 + 选择具体图标 fire");
const added = await evalJs(`(() => {
    document.getElementById("addCustomButton").click();
    const forms = document.querySelectorAll("#customButtonsArea .custom-button-form");
    if (!forms.length) return "no custom form";
    const form = forms[forms.length - 1];
    form.querySelector(".btn-text").value = "测试按钮A";
    const p = form.querySelector(".icon-picker");
    p.querySelector(".icon-picker-trigger").click();
    const opt = p.querySelector('.icon-picker-option[data-value="fire"]');
    if (!opt) return "no fire option";
    opt.click();
    return JSON.stringify({
        value: p.dataset.value,
        triggerClass: p.querySelector(".icon-picker-trigger i").className,
        selected: p.querySelector(".icon-picker-option.selected")?.dataset.value
    });
})()`);
let aI = {};
try {
    aI = JSON.parse(added);
} catch {
    /* ignore */
}
check("自定义表单创建成功", !!aI.value, String(added));
check("data-value = fire", aI.value === "fire", String(aI.value));
check("trigger 图标 = fa-fire", String(aI.triggerClass).includes("fa-fire"), String(aI.triggerClass));

console.log("\n[步骤3] 保存");
const saved = await evalJs(`(() => {
    document.getElementById("saveButtons").click();
    const raw = localStorage.getItem("buttonConfig");
    if (!raw) return "no buttonConfig";
    const cfg = JSON.parse(raw);
    const cs = cfg.buttons.filter(b => String(b.id).startsWith("custom_"));
    return JSON.stringify({ count: cs.length, last: cs[cs.length-1] });
})()`);
let sI = {};
try {
    sI = JSON.parse(saved);
} catch {
    /* ignore */
}
check("保存后存在 1 个自定义按钮", sI.count === 1, String(saved));
check("icon 持久化为 fire", sI.last?.icon === "fire", JSON.stringify(sI.last));

console.log("\n[步骤4] 再次打开编辑（原 bug 触发路径）");
const reopened = await evalJs(`(() => {
    document.getElementById("closeButtonEdit").click();
    document.getElementById("editButtons").click();
    const forms = document.querySelectorAll("#customButtonsArea .custom-button-form");
    if (!forms.length) return JSON.stringify({ error: "自定义表单未渲染" });
    const form = forms[forms.length - 1];
    const p = form.querySelector(".icon-picker");
    return JSON.stringify({
        text: form.querySelector(".btn-text").value,
        value: p.dataset.value,
        triggerClass: p.querySelector(".icon-picker-trigger i").className,
        selected: p.querySelector(".icon-picker-option.selected")?.dataset.value
    });
})()`);
let rI = {};
try {
    rI = JSON.parse(reopened);
} catch {
    /* ignore */
}
check("自定义按钮表单正常渲染（无异常中断）", !rI.error, String(reopened));
check("文字正确回显", rI.text === "测试按钮A", String(rI.text));
check("图标 data-value 正确回显 = fire", rI.value === "fire", String(rI.value));
check("trigger 回显 = fa-fire", String(rI.triggerClass).includes("fa-fire"), String(rI.triggerClass));
check("菜单内 selected = fire", rI.selected === "fire", String(rI.selected));

console.log("\n[步骤5] 修改文字与图标为 star 后保存");
const modified = await evalJs(`(() => {
    const form = document.querySelectorAll("#customButtonsArea .custom-button-form")[0];
    form.querySelector(".btn-text").value = "测试按钮B";
    const p = form.querySelector(".icon-picker");
    p.querySelector(".icon-picker-trigger").click();
    p.querySelector('.icon-picker-option[data-value="star"]').click();
    const beforeSave = p.dataset.value;
    document.getElementById("saveButtons").click();
    const cfg = JSON.parse(localStorage.getItem("buttonConfig"));
    const c = cfg.buttons.filter(b => String(b.id).startsWith("custom_")).pop();
    return JSON.stringify({ beforeSave, saved: c });
})()`);
let mI = {};
try {
    mI = JSON.parse(modified);
} catch {
    /* ignore */
}
check("修改后 data-value = star", mI.beforeSave === "star", String(mI.beforeSave));
check("文字已更新为 测试按钮B", mI.saved?.message === "测试按钮B", JSON.stringify(mI.saved));
check("图标已更新为 star", mI.saved?.icon === "star", JSON.stringify(mI.saved));

console.log("\n[步骤6] 刷新页面验证持久化");
await goto(BASE + "/index.html");
const afterReload = await evalJs(`(() => {
    const cfg = JSON.parse(localStorage.getItem("buttonConfig") || "{}");
    const c = (cfg.buttons || []).filter(b => String(b.id).startsWith("custom_")).pop();
    document.getElementById("editButtons").click();
    const form = document.querySelectorAll("#customButtonsArea .custom-button-form")[0];
    const p = form?.querySelector(".icon-picker");
    return JSON.stringify({
        stored: c,
        uiValue: p?.dataset.value,
        uiText: form?.querySelector(".btn-text")?.value,
        uiTrigger: p?.querySelector(".icon-picker-trigger i")?.className
    });
})()`);
let rlI = {};
try {
    rlI = JSON.parse(afterReload);
} catch {
    /* ignore */
}
check("刷新后存储仍为 star", rlI.stored?.icon === "star", JSON.stringify(rlI.stored));
check("刷新后 UI 回显 star", rlI.uiValue === "star", String(rlI.uiValue));
check("刷新后文字回显", rlI.uiText === "测试按钮B", String(rlI.uiText));
check("刷新后 trigger = fa-star", String(rlI.uiTrigger).includes("fa-star"), String(rlI.uiTrigger));

console.log("\n[步骤7] 改为 random 并重新打开确认回显");
const randomPath = await evalJs(`(() => {
    const form = document.querySelectorAll("#customButtonsArea .custom-button-form")[0];
    const p = form.querySelector(".icon-picker");
    p.querySelector(".icon-picker-trigger").click();
    p.querySelector('.icon-picker-option[data-value="random"]').click();
    const afterPick = p.dataset.value;
    document.getElementById("saveButtons").click();
    const cfg = JSON.parse(localStorage.getItem("buttonConfig"));
    const c = cfg.buttons.filter(b => String(b.id).startsWith("custom_")).pop();
    document.getElementById("closeButtonEdit").click();
    document.getElementById("editButtons").click();
    const p2 = document.querySelectorAll("#customButtonsArea .custom-button-form")[0].querySelector(".icon-picker");
    return JSON.stringify({
        afterPick,
        savedIcon: c.icon,
        reopenValue: p2.dataset.value,
        reopenSelected: p2.querySelector(".icon-picker-option.selected")?.dataset.value,
        reopenTrigger: p2.querySelector(".icon-picker-trigger i").className
    });
})()`);
let rI2 = {};
try {
    rI2 = JSON.parse(randomPath);
} catch {
    /* ignore */
}
check("选择 random 后 data-value = random", rI2.afterPick === "random", String(rI2.afterPick));
check("random 保存为 random", rI2.savedIcon === "random", String(rI2.savedIcon));
check("random 重新打开不崩且回显 random", rI2.reopenValue === "random", String(rI2.reopenValue));
check("random selected = random", rI2.reopenSelected === "random", String(rI2.reopenSelected));
check("random trigger = fa-shuffle", String(rI2.reopenTrigger).includes("fa-shuffle"), String(rI2.reopenTrigger));

console.log("\n[步骤8] 删除自定义按钮（回归）");
const del = await evalJs(`(() => {
    const before = document.querySelectorAll("#customButtonsArea .custom-button-form").length;
    document.querySelectorAll("#customButtonsArea .custom-button-form")[0].querySelector(".remove-btn").click();
    const after = document.querySelectorAll("#customButtonsArea .custom-button-form").length;
    document.getElementById("saveButtons").click();
    const cfg = JSON.parse(localStorage.getItem("buttonConfig"));
    return JSON.stringify({ before, after, remainingCustom: cfg.buttons.filter(b => String(b.id).startsWith("custom_")).length, total: cfg.buttons.length });
})()`);
let dI = {};
try {
    dI = JSON.parse(del);
} catch {
    /* ignore */
}
check("删除后表单数减少", dI.after === dI.before - 1, String(del));
check("保存后自定义按钮数归零", dI.remainingCustom === 0, String(dI.remainingCustom));
check("默认按钮保留（2 个）", dI.total === 2, String(dI.total));

console.log("\n[步骤9] 默认按钮编辑路径（回归）");
const defBtn = await evalJs(`(() => {
    const p = document.getElementById("button1Icon");
    if (!p) return JSON.stringify({ error: "no #button1Icon" });
    p.querySelector(".icon-picker-trigger").click();
    p.querySelector('.icon-picker-option[data-value="bell"]').click();
    document.getElementById("saveButtons").click();
    const cfg = JSON.parse(localStorage.getItem("buttonConfig"));
    return JSON.stringify({ value: p.dataset.value, saved: cfg.buttons[0] });
})()`);
let dbI = {};
try {
    dbI = JSON.parse(defBtn);
} catch {
    /* ignore */
}
check("默认按钮 picker 可用", !dbI.error, String(defBtn));
check("默认按钮图标可改并保存", dbI.saved?.icon === "bell", JSON.stringify(dbI.saved));

console.log("\n[步骤10] 页面异常检查");
const uniq = [...new Set(pageErrors)];
check("全流程无未捕获异常 / console.error", uniq.length === 0, uniq.join(" | "));

console.log("\n=== 结果 ===");
console.log(`环境：${ver.Browser}`);
console.log(`URL ：${BASE}/index.html`);
console.log(`断言：${pass} passed, ${fail} failed`);
if (failedItems.length) {
    console.log("失败项：");
    failedItems.forEach(f => console.log("  - " + f));
}
if (uniq.length) {
    console.log("页面错误：");
    uniq.forEach(e => console.log("  - " + e));
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
