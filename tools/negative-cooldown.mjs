// CM-006 反向验证：把 cooldown 回退到收敛前的版本，确认回归测试确实会失败。
//
// 运行方式：
//   node tools/negative-cooldown.mjs
//
// 原理：直接取用基线 ref 中的**原始文件内容**覆盖当前工作区，跑一次
// cooldown.mjs，预期失败；随后还原，再跑一次，预期通过。
//
// 为什么用"从 git 取原文"而不是手写回退片段：
//   手写回退容易与真实历史版本产生偏差，得到"看起来能区分"的假结论。
//   直接从基线 ref 取原文，回退的就是真缺陷版本。
//
// 安全保证（与 negative-input-safety.mjs 一致）：
//   - 纯文件快照/还原 + try/finally，异常中断也会还原。
//     **不使用 git stash** —— 本机环境下 git stash 曾损坏 .git/refs。
//   - 备份目录在 .workbuddy/ 下，运行结束即清理。
//   - 只改 5 个被测源码文件，不动其他任何文件。
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 回退来源：默认取 main（本任务分支的基线，含收敛前的原始实现）
const BASE_REF = process.env.CM006_BASE_REF || 'main';

// 被测文件（任务 Scope 内的 5 个源码）
const TARGETS = [
    'js/modules/state.js',
    'js/main.js',
    'js/modules/buttonManager.js',
    'js/modules/notification.js',
    'js/modules/countdown.js'
];

const BACKUP_DIR = path.join(ROOT, '.workbuddy', 'cm006_backup');
const TEST_SCRIPT = path.join(ROOT, 'tools', 'cooldown.mjs');

const out = [];
function log(...a) {
    const line = a.join(' ');
    out.push(line);
    console.log(line);
}

function gitShow(ref, relPath) {
    return execFileSync('git', ['show', `${ref}:${relPath}`], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
    });
}

// 行尾归一化后再比较。
// 本仓 core.autocrlf=true：工作区是 CRLF，而 git show 给出 LF，
// 直接比较会永远判定为"不同"。这里归一化，让"是否真的有差异"这一判断可信。
const norm = (s) => s.replace(/\r\n/g, '\n');

function runTest(label) {
    log('');
    log(`  ── 运行 cooldown.mjs（${label}）──`);
    const r = spawnSync(process.execPath, [TEST_SCRIPT], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        // 清掉 CM006_LOG：两次运行会写同一路径、互相覆盖，导致证据混乱。
        // 需要落盘时请直接单独运行 cooldown.mjs。
        env: { ...process.env, CM006_LOG: '' }
    });
    const stdout = r.stdout || '';
    const lines = stdout.split(/\r?\n/);
    const summary = lines.filter((l) => /passed|failed/.test(l)).pop();
    // 全部 FAIL 明细（用于判断"失败原因是否确为 cooldown 责任分散"）
    const allFails = lines.filter((l) => l.includes('FAIL')).map((l) => l.trim());
    log(`     退出码 : ${r.status}`);
    log(`     汇总   : ${summary || '(无汇总)'}`);
    // 注意：cooldown.mjs 每个场景约 20+ 条断言，回退后会失败较多，
    // 因此这里打印多一点，便于人工核对失败原因。
    allFails.slice(0, 20).forEach((f) => log('      ' + f));
    if (allFails.length > 20) log(`      …（其余 ${allFails.length - 20} 条见上方完整输出）`);
    return { code: r.status, stdout, summary: summary || '', allFails };
}

log('=== CM-006 反向验证：cooldown 单一责任是否可被测试区分 ===');
log('');
log(`回退来源 ref : ${BASE_REF}`);
log(`被测文件     : ${TARGETS.length} 个`);

// 确认 ref 存在
try {
    gitShow(BASE_REF, TARGETS[0]);
} catch (e) {
    log('');
    log(`ERROR: 无法从 ref '${BASE_REF}' 读取 ${TARGETS[0]}`);
    log(String(e.message || e));
    process.exit(2);
}

// 确认当前版本与 ref 版本确实不同（否则回退没有意义）
let alreadySame = true;
for (const t of TARGETS) {
    const current = readFileSync(path.join(ROOT, t), 'utf8');
    if (norm(current) !== norm(gitShow(BASE_REF, t))) alreadySame = false;
}
if (alreadySame) {
    log('');
    log(`ERROR: 当前文件与 '${BASE_REF}' 完全相同 —— 没有可回退的改动。`);
    process.exit(2);
}

mkdirSync(BACKUP_DIR, { recursive: true });

// 三者在 try/finally 中被赋值，在 finally 之后再读取
let baseline;
let reverted;
let restored;

try {
    // ── 步骤 1：当前版本（已收敛）──
    baseline = runTest('已收敛版本（预期通过）');

    // ── 步骤 2：备份 + 回退到收敛前实现 ──
    log('');
    log('  ── 回退到收敛前版本 ──');
    for (const t of TARGETS) {
        const abs = path.join(ROOT, t);
        copyFileSync(abs, path.join(BACKUP_DIR, path.basename(t) + '.bak'));
        writeFileSync(abs, gitShow(BASE_REF, t), 'utf8');
        log(`     已回退 : ${t}`);
    }

    reverted = runTest('回退版本（预期失败）');
} finally {
    // ── 步骤 3：无条件还原 ──
    log('');
    log('  ── 还原当前版本 ──');
    for (const t of TARGETS) {
        const bak = path.join(BACKUP_DIR, path.basename(t) + '.bak');
        if (!existsSync(bak)) continue;
        copyFileSync(bak, path.join(ROOT, t));
    }
    // 校验：磁盘内容必须与备份一致
    let ok = true;
    for (const t of TARGETS) {
        const bak = path.join(BACKUP_DIR, path.basename(t) + '.bak');
        if (!existsSync(bak)) continue;
        if (readFileSync(path.join(ROOT, t), 'utf8') !== readFileSync(bak, 'utf8')) {
            ok = false;
        }
    }
    restored = ok;
    log(`     已还原 = ${ok}`);
    // 备份目录含 .bak，保留到校验完成后清理
    rmSync(BACKUP_DIR, { recursive: true, force: true });
}

// ── 结论 ──
//
// 判定"测试有区分力"必须同时满足：
//   1. 已收敛版本通过（退出码 0，且汇总 0 failed）
//   2. 回退版本失败（退出码非 0）
//   3. 回退版本的失败**确由本轮收敛点相关断言触发** ——
//      否则可能只是端口占用、Chrome 起不来等基础设施抖动造成的假阳性。
//      只比较退出码会把环境故障误读成"测试有效"。
//
// 关键字分组对应三类缺陷：
//   - 写入点唯一（责任收敛）：原实现有 4 个模块触碰同一个 key
//   - 定时器去重：原实现每次冷却会多出 2 个不可取消的长延时 timeout
//   - 未来时间戳 clamp：原实现会把用户锁死超过一个冷却周期
//   - 责任者接口：原实现没有统一接口（restore/startFromNow/cancel/remaining）
const OWNERSHIP_MARKERS = ['仅 countdown', 'countdown 确实是唯一写入者'];
const TIMER_MARKERS = ['长延时 timeout', '已武装 interval', '只有 1 个在跑'];
// 未来时间戳：旧实现会把 3660 秒直接渲染出来（见回退版实测文本），
// 因此"显示文本"这条断言可独立区分 clamp 行为是否存在。
const FUTURE_MARKERS = ['clamp', '锁死', '显示文本为 60 秒'];
const API_MARKERS = ['责任者接口', '责任者提供'];

function countMatches(fails, markers) {
    return fails ? fails.filter((l) => markers.some((m) => l.includes(m))) : [];
}

const ownershipFails = countMatches(reverted && reverted.allFails, OWNERSHIP_MARKERS);
const timerFails = countMatches(reverted && reverted.allFails, TIMER_MARKERS);
const futureFails = countMatches(reverted && reverted.allFails, FUTURE_MARKERS);
const apiFails = countMatches(reverted && reverted.allFails, API_MARKERS);

log('');
log('=== 结论 ===');
log(`已收敛版本退出码 : ${baseline ? baseline.code : '(未执行)'} (预期 0)`);
log(`已收敛版本汇总   : ${baseline ? baseline.summary : '(未执行)'} (预期 0 failed)`);
log(`回退版本退出码   : ${reverted ? reverted.code : '(未执行)'} (预期非 0)`);
log(`回退版本汇总     : ${reverted ? reverted.summary : '(未执行)'}`);
log(`回退版本失败总数 : ${reverted ? reverted.allFails.length : 0}`);
log('');
log(`  写入点唯一类失败 : ${ownershipFails.length} 条 (预期 > 0)`);
ownershipFails.slice(0, 6).forEach((f) => log(`     - ${f}`));
log(`  定时器去重类失败 : ${timerFails.length} 条 (预期 > 0)`);
timerFails.slice(0, 6).forEach((f) => log(`     - ${f}`));
log(`  未来时间戳类失败 : ${futureFails.length} 条`);
futureFails.slice(0, 6).forEach((f) => log(`     - ${f}`));
log(`  责任者接口类失败 : ${apiFails.length} 条`);
apiFails.slice(0, 6).forEach((f) => log(`     - ${f}`));
log('');
log(`源码已还原       : ${restored} (预期 true)`);

const baselineOk = baseline && baseline.code === 0 && /0 failed/.test(baseline.summary);
// 核心是前两类：它们直接对应本任务的两个缺陷（重复写入、重复定时器）
const revertedOk =
    reverted && reverted.code !== 0 && ownershipFails.length > 0 && timerFails.length > 0;
const ok = baselineOk && revertedOk && restored === true;

log(
    `结果             : ${
        ok
            ? '通过——测试对「写入点分散」与「重复定时器」均有区分力'
            : '不通过——需检查（注意区分真缺陷与基础设施抖动）'
    }`
);

process.exit(ok ? 0 : 1);
