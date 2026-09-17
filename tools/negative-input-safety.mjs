// CM-005 反向验证：把注入防护回退到修复前的版本，确认回归测试确实会失败。
//
// 运行方式：
//   node tools/negative-input-safety.mjs
//
// 原理：直接取用基线分支中的**原始文件内容**覆盖当前工作区，跑一次
// input-safety.mjs，预期失败；随后还原修复版本，再跑一次，预期通过。
//
// 为什么用"从 git 取原文"而不是手写回退片段：
//   手写回退容易与真实历史版本产生偏差，得到"看起来能区分"的假结论。
//   直接从基线 ref 取原文，回退的就是真缺陷版本。
//
// 安全保证：
//   - 用纯文件快照/还原 + try/finally，异常中断也会还原（不碰 git stash：
//     本机环境下 git stash 曾损坏 .git/refs）。
//   - 备份目录在 .workbuddy/ 下，运行结束即清理。
//   - 只改 js/modules/ 下两个被测文件，不动其他任何文件。
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

// 回退来源：默认取 main（任务分支的基线，含修复前的原始实现）
const BASE_REF = process.env.CM005_BASE_REF || "main";

// 被测文件（都是任务 Scope 内的源码）
const TARGETS = ["js/modules/buttonManager.js", "js/modules/history.js"];

const BACKUP_DIR = path.join(ROOT, ".workbuddy", "cm005_backup");
const TEST_SCRIPT = path.join(ROOT, "tools", "input-safety.mjs");

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

function runTest(label) {
    log("");
    log(`  ── 运行 input-safety.mjs（${label}）──`);
    const r = spawnSync(process.execPath, [TEST_SCRIPT], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    const stdout = r.stdout || "";
    const lines = stdout.split(/\r?\n/);
    const summary = lines.filter(l => /passed|failed/.test(l)).pop();
    // 全部 FAIL 明细（用于判断"失败原因是否确为注入"）
    const allFails = lines
        .filter(l => l.includes("FAIL"))
        .map(l => l.trim());
    const fails = allFails.slice(0, 12);
    log(`     退出码 : ${r.status}`);
    log(`     汇总   : ${summary || "(无汇总)"}`);
    if (fails.length) {
        log(`     失败项（最多列 12 条）:`);
        fails.forEach(f => log("      " + f));
    }
    return { code: r.status, stdout, summary: summary || "", allFails };
}

log("=== CM-005 反向验证：注入防护是否可被测试区分 ===");
log("");
log(`回退来源 ref : ${BASE_REF}`);
log(`被测文件     : ${TARGETS.join(", ")}`);

// 确认 ref 存在
try {
    gitShow(BASE_REF, TARGETS[0]);
} catch (e) {
    log("");
    log(`ERROR: 无法从 ref '${BASE_REF}' 读取 ${TARGETS[0]}`);
    log(String(e.message || e));
    process.exit(2);
}

// 确认当前版本与 ref 版本确实不同（否则回退没有意义）
let alreadySame = true;
for (const t of TARGETS) {
    const current = readFileSync(path.join(ROOT, t), "utf8");
    if (current !== gitShow(BASE_REF, t)) alreadySame = false;
}
if (alreadySame) {
    log("");
    log(`ERROR: 当前文件与 '${BASE_REF}' 完全相同 —— 没有可回退的修复。`);
    process.exit(2);
}

mkdirSync(BACKUP_DIR, { recursive: true });

// 三者在 try/finally 中被赋值，在 finally 之后再读取；
// 不预置初始值，避免"赋值后未被读取"的无用赋值。
let restored;
let baseline;
let reverted;

try {
    // ── 步骤 1：基线（已修复）──
    baseline = runTest("已修复版本");

    // ── 步骤 2：备份 + 回退到原实现 ──
    log("");
    log("  ── 回退到修复前版本 ──");
    for (const t of TARGETS) {
        const abs = path.join(ROOT, t);
        copyFileSync(abs, path.join(BACKUP_DIR, path.basename(t) + ".bak"));
        writeFileSync(abs, gitShow(BASE_REF, t), "utf8");
        log(`     已回退 : ${t}`);
    }

    reverted = runTest("回退版本（预期失败）");
} finally {
    // ── 步骤 3：无条件还原 ──
    log("");
    log("  ── 还原修复版本 ──");
    for (const t of TARGETS) {
        const bak = path.join(BACKUP_DIR, path.basename(t) + ".bak");
        if (!existsSync(bak)) continue;
        copyFileSync(bak, path.join(ROOT, t));
    }
    // 校验：磁盘内容必须与备份一致
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
// 判定"测试有区分力"必须同时满足三件事，缺一不可：
//   1. 修复版通过（退出码 0，且汇总为 0 failed）
//   2. 回退版失败（退出码非 0）
//   3. 回退版的失败**确由注入类断言触发** —— 否则可能只是
//      端口占用、Chrome 起不来等基础设施抖动造成的假阳性。
// 第 3 条是这里的关键：只比较退出码会把环境故障误读成"测试有效"。
const INJECTION_MARKERS = [
    "元素注入",
    "事件属性注入",
    "未执行",
    "字面文本",
    "注入片段",
];
const injectionFails = reverted
    ? reverted.allFails.filter(l => INJECTION_MARKERS.some(m => l.includes(m)))
    : [];

log("");
log("=== 结论 ===");
log(`修复版本退出码 : ${baseline ? baseline.code : "(未执行)"} (预期 0)`);
log(
    `修复版本汇总   : ${baseline ? baseline.summary : "(未执行)"} (预期 0 failed)`
);
log(`回退版本退出码 : ${reverted ? reverted.code : "(未执行)"} (预期非 0)`);
log(
    `回退版本注入类失败项 : ${injectionFails.length} 条 (预期 > 0)`
);
if (injectionFails.length) {
    injectionFails.slice(0, 8).forEach(f => log(`     - ${f}`));
}
log(`源码已还原     : ${restored} (预期 true)`);

const baselineOk = baseline && baseline.code === 0 && /0 failed/.test(baseline.summary);
const revertedOk = reverted && reverted.code !== 0 && injectionFails.length > 0;
const ok = baselineOk && revertedOk && restored === true;

log(
    `结果           : ${
        ok
            ? "通过——测试对注入缺陷有区分力（失败确由注入类断言触发）"
            : "不通过——需检查（注意区分真缺陷与基础设施抖动）"
    }`
);

process.exit(ok ? 0 : 1);
