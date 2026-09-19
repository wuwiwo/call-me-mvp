// CM-010 访问提示（password gate）回归脚本（可复现）
//
// 运行方式：
//   node tools/password-gate.mjs
//
// 目标（对应 docs/SECURITY.md 的威胁模型）：
//   1. 触发语义：无记录 / 已过期 / 记录损坏 → 需要验证；7 天内 → 不打扰
//   2. 行为不变：默认密码可过、错密码报错、setPassword / clearPassword 语义
//   3. 单一来源：password.js 不再硬编码默认密码与过期天数，改从 CONFIG.password 读
//   4. 诚实文案：四语言 hint 不得声称或暗示「保护 / 安全 / 加密 / 授权」
//
// 观测方式（不在生产代码里留测试钩子）：
//   - 通过预置 LocalStorage + 重新加载页面，走真实的 main.js → password.init() 路径
//   - 页面内 `await import('/js/modules/password.js')` 取到应用同一 ESM 实例，
//     直接调 verify / setPassword / clearPassword
//   - 源码级断言用 Node 侧 readFileSync（不依赖页面）
//
// 依赖：仅 Node 内置模块 + 本机 Chrome，零 npm 依赖。
import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChrome } from "./chrome-path.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVE_PORT = Number(process.env.CM010_PORT || 8899);
const EXTERNAL = process.env.CM010_NO_SERVER === "1";
const BASE = process.env.CM010_BASE || `http://127.0.0.1:${SERVE_PORT}`;
const CDP_PORT = Number(process.env.CM010_CDP_PORT || 9450);
// Chrome 路径解析已统一到 tools/chrome-path.mjs（CM-009）：
// CM010_CHROME > CHROME_PATH > 常见安装位置 > which
const CHROME = resolveChrome(process.env.CM010_CHROME);

const DAY_MS = 24 * 60 * 60 * 1000;

// hint 文案的禁用词：不得声称或暗示安全性
const FORBIDDEN = [
    "保护", "安全", "加密", "授权",
    "protect", "secure", "encrypt", "authoriz",
    "保護", "暗号", "보안", "암호", "인증",
];

// 「不诚实」词：旧文案声称了一个不存在的机制（"每周更新 / 联系管理员"）。
// 只查禁用词是不够的 —— 旧文案并不含上面那些词，但它在骗人。
const DISHONEST = ["每周", "管理员", "更新", "weekly", "admin", "update", "週", "관리자", "매주"];

// 每种语言里表示"可以被绕过"的说法：诚实文案应当**主动说明**这一点
const BYPASS_WORD = { zh: "绕过", en: "bypass", ja: "回避", ko: "우회" };

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

const PROFILE = path.join(os.tmpdir(), "cm010-password-profile");
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

console.log("=== CM-010 访问提示回归 ===\n");

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
console.log("  Chrome   :", CHROME);
console.log("  浏览器   :", ver.Browser);
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
    await new Promise(r => setTimeout(r, 300));
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

// ── 快照 ──
const SNAP = `(async () => {
    const { TRANSLATIONS } = await import('/js/modules/translations.js');
    const { CONFIG } = await import('/js/modules/config.js');
    const modal = document.getElementById('passwordModal');
    const errEl = document.getElementById('passwordError');
    const hints = {};
    for (const l of ['zh','en','ja','ko']) hints[l] = TRANSLATIONS[l] && TRANSLATIONS[l].password && TRANSLATIONS[l].password.hint;
    return JSON.stringify({
        lang: localStorage.getItem('appLanguage'),
        hasModal: !!modal,
        hintText: modal ? (modal.querySelector('.password-hint span')?.textContent ?? null) : null,
        titleText: modal ? (modal.querySelector('h2')?.textContent ?? null) : null,
        errorVisible: !!(errEl && errEl.style.display !== 'none'),
        errorText: errEl ? errEl.textContent : null,
        timestamp: localStorage.getItem('passwordSetTime'),
        storedPassword: localStorage.getItem('accessPassword'),
        cfgDefault: CONFIG.password && CONFIG.password.defaultPassword,
        cfgExpiryDays: CONFIG.password && CONFIG.password.expiryDays,
        hints
    });
})()`;

async function snap() {
    try {
        return JSON.parse(await evalJs(SNAP));
    } catch (e) {
        return { error: String(e.message || e) };
    }
}

/** 预置 LocalStorage 后重新加载首页（走真实 main.js → password.init 路径）。 */
async function seed(entries = {}) {
    const lines = Object.entries(entries)
        .map(([k, v]) =>
            v === null
                ? `localStorage.removeItem(${JSON.stringify(k)});`
                : `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(String(v))});`
        )
        .join("\n        ");
    await evalJs(`(() => {
        localStorage.clear();
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('appLanguage', 'zh');
        ${lines}
        return true;
    })()`);
    await goto(BASE + "/index.html");
}

/** 在模态框里填入密码并点击验证按钮（走真实的交互路径）。 */
async function typeAndVerify(value) {
    return evalJs(`(() => {
        const modal = document.getElementById('passwordModal');
        if (!modal) return 'no-modal';
        const input = modal.querySelector('#passwordInput');
        if (!input) return 'no-input';
        input.value = ${JSON.stringify(value)};
        const btn = modal.querySelector('#verifyPassword');
        if (!btn) return 'no-btn';
        btn.click();
        return 'ok';
    })()`);
}

await goto(BASE + "/index.html");

// ── S0 前置 ──
console.log("─".repeat(64));
console.log("S0 前置：配置与模块接口");
console.log("─".repeat(64));
await seed({});
let s = await snap();
check("快照可取（模块可导入）", !s.error, s.error || "");
check("CONFIG.password 有 defaultPassword", typeof s.cfgDefault === "string" && s.cfgDefault !== "", JSON.stringify(s.cfgDefault));
check("CONFIG.password 有 expiryDays", typeof s.cfgExpiryDays === "number", String(s.cfgExpiryDays));
const DEFAULT_PW = s.cfgDefault;
const EXPIRY_DAYS = s.cfgExpiryDays;

// ── S1 触发语义 ──
console.log("\n" + "─".repeat(64));
console.log("S1 触发语义：无记录 / 7 天内 / 超期 / 记录损坏");
console.log("─".repeat(64));

await seed({ passwordSetTime: null });
s = await snap();
check("无 passwordSetTime → 弹窗", s.hasModal === true, String(s.hasModal));
check("弹窗内 hint 已渲染", typeof s.hintText === "string" && s.hintText.length > 0, JSON.stringify(s.hintText));

await seed({ passwordSetTime: "" });
s = await snap();
check("passwordSetTime 为空串 → 弹窗", s.hasModal === true, String(s.hasModal));

await seed({ passwordSetTime: Date.now() - 3 * DAY_MS });
s = await snap();
check("3 天前验证过 → 不弹窗", s.hasModal === false, String(s.hasModal));

await seed({ passwordSetTime: Date.now() - (EXPIRY_DAYS - 1) * DAY_MS });
s = await snap();
check(`未超过 ${EXPIRY_DAYS} 天（第 ${EXPIRY_DAYS - 1} 天）→ 不弹窗`, s.hasModal === false, String(s.hasModal));

await seed({ passwordSetTime: Date.now() - (EXPIRY_DAYS + 1) * DAY_MS });
s = await snap();
check(`超过 ${EXPIRY_DAYS} 天 → 弹窗`, s.hasModal === true, String(s.hasModal));

for (const bad of ["abc", "NaN", "Infinity", "  ", "12abc"]) {
    await seed({ passwordSetTime: bad });
    s = await snap();
    check(
        `时间戳损坏 ${JSON.stringify(bad)} → 弹窗（按已过期处理）`,
        s.hasModal === true,
        `hasModal=${s.hasModal}`
    );
}

// ── S2 默认密码与错误路径 ──
console.log("\n" + "─".repeat(64));
console.log("S2 验证交互：默认密码可过 / 错密码报错");
console.log("─".repeat(64));
await seed({ passwordSetTime: null });
s = await snap();
check("初始为弹窗状态", s.hasModal === true, String(s.hasModal));

const wrong = await typeAndVerify("definitely-wrong");
check("错密码：交互可执行", wrong === "ok", String(wrong));
s = await snap();
check("错密码 → 报错文案显示", s.errorVisible === true && typeof s.errorText === "string" && s.errorText.length > 0, JSON.stringify(s.errorText));
check("错密码 → 弹窗仍在（未放行）", s.hasModal === true, String(s.hasModal));
check("错密码 → 未写入验证时间戳", !s.timestamp, String(s.timestamp));

const okRes = await typeAndVerify(DEFAULT_PW);
check("默认密码：交互可执行", okRes === "ok", String(okRes));
s = await snap();
check("默认密码 → 弹窗关闭", s.hasModal === false, String(s.hasModal));
check("默认密码 → 写入 passwordSetTime", !!s.timestamp && Number.isFinite(Number(s.timestamp)), String(s.timestamp));

// ── S3 verify / setPassword / clearPassword ──
console.log("\n" + "─".repeat(64));
console.log("S3 模块语义：verify / setPassword / clearPassword");
console.log("─".repeat(64));
const semantics = JSON.parse(
    await evalJs(`(async () => {
        const { password } = await import('/js/modules/password.js');
        const out = {};
        localStorage.removeItem('accessPassword');
        out.verifyDefault = password.verify(${JSON.stringify(DEFAULT_PW)});
        out.verifyWrong = password.verify('nope');
        password.setPassword('my-new-pw');
        out.storedAfterSet = localStorage.getItem('accessPassword');
        out.verifyNew = password.verify('my-new-pw');
        out.verifyDefaultAfterSet = password.verify(${JSON.stringify(DEFAULT_PW)});
        password.clearPassword();
        out.storedAfterClear = localStorage.getItem('accessPassword');
        out.timeAfterClear = localStorage.getItem('passwordSetTime');
        out.verifyDefaultAfterClear = password.verify(${JSON.stringify(DEFAULT_PW)});
        return JSON.stringify(out);
    })()`)
);
check("verify(默认密码) === true", semantics.verifyDefault === true, String(semantics.verifyDefault));
check("verify(错密码) === false", semantics.verifyWrong === false, String(semantics.verifyWrong));
check("setPassword 覆盖写入 accessPassword", semantics.storedAfterSet === "my-new-pw", String(semantics.storedAfterSet));
check("setPassword 后 verify(新密码) === true", semantics.verifyNew === true, String(semantics.verifyNew));
check("setPassword 后 verify(默认密码) === false", semantics.verifyDefaultAfterSet === false, String(semantics.verifyDefaultAfterSet));
check("clearPassword 清掉 accessPassword", semantics.storedAfterClear === null, String(semantics.storedAfterClear));
check("clearPassword 清掉 passwordSetTime", semantics.timeAfterClear === null, String(semantics.timeAfterClear));
check("clearPassword 后回退默认密码", semantics.verifyDefaultAfterClear === true, String(semantics.verifyDefaultAfterClear));

await seed({ passwordSetTime: Date.now(), accessPassword: "my-new-pw" });
s = await snap();
check("setPassword 后新时间戳 → 不弹窗", s.hasModal === false, String(s.hasModal));

// ── S4 诚实文案（四语言）──
console.log("\n" + "─".repeat(64));
console.log("S4 诚实文案：四语言 hint 不得暗示安全性");
console.log("─".repeat(64));
await seed({ passwordSetTime: null });
const LANGS = ["zh", "en", "ja", "ko"];
const hintVals = [];
for (const l of LANGS) {
    await seed({ passwordSetTime: null, appLanguage: l });
    s = await snap();
    const hint = s.hintText || "";
    hintVals.push(hint);
    check(`${l}: 弹窗 hint 已渲染`, hint.length > 0, JSON.stringify(hint));
    const hits = FORBIDDEN.filter(w => hint.toLowerCase().includes(w.toLowerCase()));
    check(`${l}: hint 不含安全性暗示词`, hits.length === 0, `命中 ${JSON.stringify(hits)}：${hint}`);
    const lies = DISHONEST.filter(w => hint.toLowerCase().includes(w.toLowerCase()));
    check(
        `${l}: hint 不声称"每周更新/联系管理员"这类不存在的机制`,
        lies.length === 0,
        `命中 ${JSON.stringify(lies)}：${hint}`
    );
    check(
        `${l}: hint 明确说明"能被绕过"`,
        hint.includes(BYPASS_WORD[l]),
        `缺少 ${JSON.stringify(BYPASS_WORD[l])}：${hint}`
    );
    check(`${l}: hint 与翻译表一致`, hint === s.hints[l], `页面=${JSON.stringify(hint)} 表=${JSON.stringify(s.hints[l])}`);
}
check("四语言 hint 取值互不相同", new Set(hintVals).size === LANGS.length, JSON.stringify(hintVals.map(h => h.slice(0, 24))));

// ── S5 单一来源（源码级）──
console.log("\n" + "─".repeat(64));
console.log("S5 单一来源：password.js 不再硬编码密码与天数");
console.log("─".repeat(64));
const pwSrc = readFileSync(path.join(ROOT, "js/modules/password.js"), "utf8");
const cfgSrc = readFileSync(path.join(ROOT, "js/modules/config.js"), "utf8");
check("password.js 不含默认密码字面量", !pwSrc.includes(DEFAULT_PW), DEFAULT_PW);
check("password.js 不含 PASSWORD_EXPIRY_DAYS 常量", !pwSrc.includes("PASSWORD_EXPIRY_DAYS"));
check("password.js 不含 correctPassword 字段", !pwSrc.includes("correctPassword"));
check("password.js 从 CONFIG.password 读取配置", /CONFIG\.password/.test(pwSrc));
check(
    "password.js 不含硬编码过期天数（expiryDays = <数字>）",
    !/expiryDays\s*=\s*\d/.test(pwSrc),
    (pwSrc.match(/expiryDays\s*=\s*\d[^\n]*/) || [""])[0]
);
check("config.js 含默认密码定义（唯一来源）", cfgSrc.includes(DEFAULT_PW));

// 扫全 js/：默认密码字面量只应出现在 config.js
const literalHits = [];
(function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js") && readFileSync(p, "utf8").includes(DEFAULT_PW)) {
            literalHits.push(path.relative(ROOT, p).replace(/\\/g, "/"));
        }
    }
})(path.join(ROOT, "js"));
check(
    "js/ 下默认密码字面量只命中 config.js 一处",
    literalHits.length === 1 && literalHits[0] === "js/modules/config.js",
    JSON.stringify(literalHits)
);

// ── S6 页面异常 ──
console.log("\n" + "─".repeat(64));
console.log("S6 页面异常检查");
console.log("─".repeat(64));
const uniqErr = [...new Set(pageErrors)];
check("全流程无未捕获异常 / console.error", uniqErr.length === 0, uniqErr.join(" | "));

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
process.exit(fail === 0 ? 0 : 1);
