// CM-007 反向验证：把历史页语言支持回退到改动前的版本，确认回归测试确实会失败。
//
// 运行方式：
//   node tools/negative-history-language.mjs
//
// 原理：直接取用基线 ref 中的**原始文件内容**覆盖当前工作区，跑一次
// history-language.mjs，预期失败；随后还原，再跑一次，预期通过。
//
// 为什么用"从 git 取原文"而不是手写回退片段：
//   手写回退容易与真实历史版本产生偏差，得到"看起来能区分"的假结论。
//   直接从基线 ref 取原文，回退的就是真缺陷版本。
//
// 安全保证（与 negative-input-safety.mjs / negative-cooldown.mjs 一致）：
//   - 纯文件快照/还原 + try/finally，异常中断也会还原。
//     **不使用 git stash** —— 本机环境下 git stash 曾损坏 .git/refs。
//   - 备份目录在 .workbuddy/ 下，运行结束即清理。
//   - 只改本任务 Scope 内的 4 个文件，不动其他任何文件。
import { execFileSync, spawnSync } from "node:child_process";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// 回退来源：默认取 main（本任务分支的基线，含改动前的原始实现）
const BASE_REF = process.env.CM007_BASE_REF || "main";

// 被测文件（任务 Scope 内的 4 个）
const TARGETS = [
    "history.html",
    "js/modules/history.js",
    "js/modules/language.js",
    "js/modules/translations.js",
];

const BACKUP_DIR = path.join(ROOT, ".workbuddy", "cm007_backup");
const TEST_SCRIPT = path.join(ROOT, "tools", "history-language.mjs");

const out = [];
function log(...a) {
    const line = a.join(" ");
    out.push(line);
    console.log(line);
}

function gitShow(ref, relPath) {
    return execFileSync("git", ["show", `${ref}:${relPath}`], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    });
}

// 行尾归一化后再比较：本仓 core.autocrlf=true，工作区 CRLF、blob LF，
// 直接比较会永远判定为"不同"，令"是否真有差异"这个守卫失效。
const norm = s => s.replace(/\r\n/g, "\n");

function runTest(label) {
    log("");
    log(`  ── 运行 history-language.mjs（${label}）──`);
    const r = spawnSync(process.execPath, [TEST_SCRIPT], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        // 清掉 CM007_LOG：两次运行会写同一路径、互相覆盖
        env: { ...process.env, CM007_LOG: "" },
    });
    const stdout = r.stdout || "";
    const lines = stdout.split(/\r?\n/);
    const summary = lines.filter(l => /passed|failed/.test(l)).pop();
    const allFails = lines
        .filter(l => l.includes("FAIL"))
        .map(l => l.trim());
    log(`     退出码 : ${r.status}`);
    log(`     汇总   : ${summary || "(无汇总)"}`);
    allFails.slice(0, 24).forEach(f => log("      " + f));
    if (allFails.length > 24) {
        log(`      …（其余 ${allFails.length - 24} 条见上方完整输出）`);
    }
    return { code: r.status, stdout, summary: summary || "", allFails };
}

log("=== CM-007 反向验证：历史页语言支持是否可被测试区分 ===");
log("");
log(`回退来源 ref : ${BASE_REF}`);
log(`被测文件     : ${TARGETS.length} 个`);

try {
    gitShow(BASE_REF, TARGETS[0]);
} catch (e) {
    log("");
    log(`ERROR: 无法从 ref '${BASE_REF}' 读取 ${TARGETS[0]}`);
    log(String(e.message || e));
    process.exit(2);
}

let alreadySame = true;
for (const t of TARGETS) {
    const current = readFileSync(path.join(ROOT, t), "utf8");
    if (norm(current) !== norm(gitShow(BASE_REF, t))) alreadySame = false;
}
if (alreadySame) {
    log("");
    log(`ERROR: 当前文件与 '${BASE_REF}' 完全相同 —— 没有可回退的改动。`);
    process.exit(2);
}

mkdirSync(BACKUP_DIR, { recursive: true });

let baseline;
let reverted;
let restored;

try {
    baseline = runTest("已支持语言版本（预期通过）");

    log("");
    log("  ── 回退到改动前版本 ──");
    for (const t of TARGETS) {
        const abs = path.join(ROOT, t);
        copyFileSync(abs, path.join(BACKUP_DIR, path.basename(t) + ".bak"));
        writeFileSync(abs, gitShow(BASE_REF, t), "utf8");
        log(`     已回退 : ${t}`);
    }

    reverted = runTest("回退版本（预期失败）");
} finally {
    log("");
    log("  ── 还原当前版本 ──");
    for (const t of TARGETS) {
        const bak = path.join(BACKUP_DIR, path.basename(t) + ".bak");
        if (!existsSync(bak)) continue;
        copyFileSync(bak, path.join(ROOT, t));
    }
    let ok = true;
    for (const t of TARGETS) {
        const bak = path.join(BACKUP_DIR, path.basename(t) + ".bak");
        if (!existsSync(bak)) continue;
        if (readFileSync(path.join(ROOT, t), "utf8") !== readFileSync(bak, "utf8")) {
            ok = false;
        }
    }
    restored = ok;
    log(`     已还原 = ${ok}`);
    rmSync(BACKUP_DIR, { recursive: true, force: true });
}

// ── 结论 ──
//
// 判定"测试有区分力"必须同时满足：
//   1. 已支持版本通过（退出码 0 且汇总 0 failed）
//   2. 回退版本失败（退出码非 0）
//   3. 回退版本的失败**确由本轮改动点相关断言触发** ——
//      否则端口占用、Chrome 起不来等基础设施抖动会被误读成"测试有效"。
//
// 关键字分组：
//   - 页面文案本地化：文档标题 / 顶部标题 / 两个按钮 title / 空状态 / Webhook 标签 / toast
//   - 翻译表完整性：新增键在四语言中齐全、互不相同、命中 golden 值
const LOCALIZATION_MARKERS = [
    "文档标题",
    "顶部标题",
    "返回按钮 title",
    "清除按钮 title",
    "空状态文本",
    "错误行标签",
    "清除 toast",
];
const TABLE_MARKERS = [
    "六个键齐全",
    "取值互不相同",
    "golden",
];

function countMatches(fails, markers) {
    return fails ? fails.filter(l => markers.some(m => l.includes(m))) : [];
}

const locFails = countMatches(reverted && reverted.allFails, LOCALIZATION_MARKERS);
const tableFails = countMatches(reverted && reverted.allFails, TABLE_MARKERS);

log("");
log("=== 结论 ===");
log(`已支持版本退出码 : ${baseline ? baseline.code : "(未执行)"} (预期 0)`);
log(`已支持版本汇总   : ${baseline ? baseline.summary : "(未执行)"} (预期 0 failed)`);
log(`回退版本退出码   : ${reverted ? reverted.code : "(未执行)"} (预期非 0)`);
log(`回退版本汇总     : ${reverted ? reverted.summary : "(未执行)"}`);
log(`回退版本失败总数 : ${reverted ? reverted.allFails.length : 0}`);
log("");
log(`  页面文案本地化类失败 : ${locFails.length} 条 (预期 > 0)`);
locFails.slice(0, 8).forEach(f => log(`     - ${f}`));
log(`  翻译表完整性类失败   : ${tableFails.length} 条 (预期 > 0)`);
tableFails.slice(0, 8).forEach(f => log(`     - ${f}`));
log("");
log(`源码已还原       : ${restored} (预期 true)`);

const baselineOk = baseline && baseline.code === 0 && /0 failed/.test(baseline.summary);
const revertedOk =
    reverted &&
    reverted.code !== 0 &&
    locFails.length > 0 &&
    tableFails.length > 0;
const ok = baselineOk && revertedOk && restored === true;

log(
    `结果             : ${
        ok
            ? "通过——测试对「页面文案未随语言变化」与「翻译表缺键」均有区分力"
            : "不通过——需检查（注意区分真缺陷与基础设施抖动）"
    }`
);

process.exit(ok ? 0 : 1);
