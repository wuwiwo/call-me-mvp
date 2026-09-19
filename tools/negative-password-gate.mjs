// CM-010 反向验证：把 password.js / translations.js 回退到改造前版本，
// 确认回归测试确实会失败（否则"测试通过"没有意义）。
//
// 运行方式：
//   node tools/negative-password-gate.mjs
//
// 原理：从基线 ref 取**原文**覆盖当前工作区，跑一次 password-gate.mjs（预期失败），
// 随后还原，再跑一次（预期通过）。
//
// ★ 注意基线漂移（CM-008/009 教训）：本任务改造一旦合并进 main，
//   默认 `CM010_BASE_REF=main` 就会失效（报 exit 2「没有可回退的改动」）。
//   届时必须显式指定改造前的 commit，例如：
//     CM010_BASE_REF=<改造前 commit> node tools/negative-password-gate.mjs
//
// 安全保证（与既有 negative-*.mjs 一致）：
//   - 纯文件快照/还原 + try/finally，异常中断也会还原
//   - **不使用 `git stash`**（本机 git stash 曾损坏 .git/refs）
//   - 只改本任务 Scope 内的文件，不动其他任何文件
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

const BASE_REF = process.env.CM010_BASE_REF || "main";

// 被测文件：password.js（单一来源改造）+ translations.js（诚实文案，
// 四语言 password.* 文案实际住在这里；任务卡 SCOPE 写的 language.js 内无文案）
const TARGETS = ["js/modules/password.js", "js/modules/translations.js"];

const BACKUP_DIR = path.join(ROOT, ".workbuddy", "cm010_backup");
const TEST_SCRIPT = path.join(ROOT, "tools", "password-gate.mjs");

function log(...a) {
    console.log(a.join(" "));
}

function gitShow(ref, relPath) {
    return execFileSync("git", ["show", `${ref}:${relPath}`], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    });
}

// 行尾归一化后再比较：本仓 core.autocrlf=true，工作区 CRLF、blob LF
const norm = s => s.replace(/\r\n/g, "\n");

function runTest(label) {
    log("");
    log(`  ── 运行 password-gate.mjs（${label}）──`);
    const r = spawnSync(process.execPath, [TEST_SCRIPT], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        // 清掉可能继承的 CM010_* 覆盖，避免两次运行互相干扰
        env: { ...process.env, CM010_LOG: "", CM010_CDP_PORT: process.env.CM010_CDP_PORT || "" },
    });
    const stdout = r.stdout || "";
    const lines = stdout.split(/\r?\n/);
    const summary = lines.filter(l => /passed|failed/.test(l)).pop();
    const allFails = lines.filter(l => l.includes("FAIL")).map(l => l.trim());
    log(`     退出码 : ${r.status}`);
    log(`     汇总   : ${summary || "(无汇总)"}`);
    allFails.slice(0, 26).forEach(f => log("      " + f));
    if (allFails.length > 26) {
        log(`      …（其余 ${allFails.length - 26} 条见上方完整输出）`);
    }
    return { code: r.status, stdout, summary: summary || "", allFails };
}

log("=== CM-010 反向验证：单一来源与诚实文案是否可被测试区分 ===");
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
    log("若改造已合并进 main，请用 CM010_BASE_REF=<改造前 commit> 指定基线。");
    process.exit(2);
}

mkdirSync(BACKUP_DIR, { recursive: true });

let baseline;
let reverted;
let restored;

try {
    baseline = runTest("已改造版本（预期通过）");

    log("");
    log("  ── 回退到改造前版本 ──");
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
//   1. 已改造版本通过（退出码 0 且 0 failed）
//   2. 回退版本失败（退出码非 0）
//   3. 失败项**同时命中"单一来源"与"诚实文案"两类关键字**（任务卡要求），
//      否则端口占用、Chrome 起不来等基础设施抖动会被误读成"测试有效"
const SINGLE_SOURCE_MARKERS = [
    "不含默认密码字面量",
    "PASSWORD_EXPIRY_DAYS",
    "correctPassword",
    "从 CONFIG.password 读取配置",
    "只命中 config.js 一处",
];
const HONEST_COPY_MARKERS = [
    "不声称",
    "明确说明",
];
// 第三类：损坏时间戳的行为修正（原实现 NaN 比较恒为 false → 不弹窗）
const CORRUPT_MARKERS = ["时间戳损坏"];

const countMatches = (fails, markers) =>
    fails ? fails.filter(l => markers.some(m => l.includes(m))) : [];

const srcFails = countMatches(reverted && reverted.allFails, SINGLE_SOURCE_MARKERS);
const copyFails = countMatches(reverted && reverted.allFails, HONEST_COPY_MARKERS);
const corruptFails = countMatches(reverted && reverted.allFails, CORRUPT_MARKERS);

log("");
log("=== 结论 ===");
log(`已改造版本退出码 : ${baseline ? baseline.code : "(未执行)"} (预期 0)`);
log(`已改造版本汇总   : ${baseline ? baseline.summary : "(未执行)"} (预期 0 failed)`);
log(`回退版本退出码   : ${reverted ? reverted.code : "(未执行)"} (预期非 0)`);
log(`回退版本汇总     : ${reverted ? reverted.summary : "(未执行)"}`);
log(`回退版本失败总数 : ${reverted ? reverted.allFails.length : 0}`);
log("");
log(`  单一来源类失败 : ${srcFails.length} 条 (预期 > 0)`);
srcFails.slice(0, 8).forEach(f => log(`     - ${f}`));
log(`  诚实文案类失败 : ${copyFails.length} 条 (预期 > 0)`);
copyFails.slice(0, 8).forEach(f => log(`     - ${f}`));
log(`  损坏时间戳类失败 : ${corruptFails.length} 条`);
corruptFails.slice(0, 8).forEach(f => log(`     - ${f}`));
log("");
log(`源码已还原       : ${restored} (预期 true)`);

const baselineOk = baseline && baseline.code === 0 && /0 failed/.test(baseline.summary);
const revertedOk =
    reverted &&
    reverted.code !== 0 &&
    srcFails.length > 0 &&
    copyFails.length > 0;
const ok = baselineOk && revertedOk && restored === true;

log(
    `结果             : ${
        ok
            ? "通过——测试对「密码配置重复定义」与「不诚实文案」均有区分力"
            : "不通过——需检查（注意区分真缺陷与基础设施抖动）"
    }`
);

process.exit(ok ? 0 : 1);
