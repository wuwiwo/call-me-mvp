// CM-008 反向验证：把回执轮询回退到可取消改造之前的版本，确认回归测试确实会失败。
//
// 运行方式：
//   node tools/negative-receipt-lifecycle.mjs
//
// 原理：直接取用基线 ref 中的**原始文件内容**覆盖当前工作区，跑一次
// receipt-lifecycle.mjs，预期失败；随后还原，再跑一次，预期通过。
//
// 为什么用"从 git 取原文"而不是手写回退片段：
//   手写回退容易与真实历史版本产生偏差，得到"看起来能区分"的假结论。
//   直接从基线 ref 取原文，回退的就是真缺陷版本。
//
// 安全保证（与 negative-input-safety.mjs / negative-cooldown.mjs /
// negative-history-language.mjs 一致）：
//   - 纯文件快照/还原 + try/finally，异常中断也会还原。
//     **不使用 git stash** —— 本机环境下 git stash 曾损坏 .git/refs。
//   - 备份目录在 .workbuddy/ 下，运行结束即清理。
//   - 只改本任务 Scope 内的 1 个文件，不动其他任何文件。
//
// 注意：本脚本跑的回归包含两处约 32s 的超时窗口，因此**单次运行约 2 分钟**，
//       连同回退版共约 4 分钟，请留足时间。
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 回退来源：默认取 main（本任务分支的基线，含改造前的原始实现）
const BASE_REF = process.env.CM008_BASE_REF || 'main';

// 被测文件（本任务只有这一个源码文件）
const TARGETS = ['js/modules/notification.js'];

const BACKUP_DIR = path.join(ROOT, '.workbuddy', 'cm008_backup');
const TEST_SCRIPT = path.join(ROOT, 'tools', 'receipt-lifecycle.mjs');

function log(...a) {
    console.log(a.join(' '));
}

function gitShow(ref, relPath) {
    return execFileSync('git', ['show', `${ref}:${relPath}`], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
    });
}

// 行尾归一化后再比较：本仓 core.autocrlf=true，工作区 CRLF、blob LF，
// 直接比较会永远判定为"不同"，令"是否真有差异"这个守卫失效。
const norm = (s) => s.replace(/\r\n/g, '\n');

function runTest(label) {
    log('');
    log(`  ── 运行 receipt-lifecycle.mjs（${label}）──`);
    const r = spawnSync(process.execPath, [TEST_SCRIPT], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        // 清掉 CM008_LOG：两次运行会写同一路径、互相覆盖
        env: { ...process.env, CM008_LOG: '' }
    });
    const stdout = r.stdout || '';
    const lines = stdout.split(/\r?\n/);
    const summary = lines.filter((l) => /passed|failed/.test(l)).pop();
    const allFails = lines.filter((l) => l.includes('FAIL')).map((l) => l.trim());
    log(`     退出码 : ${r.status}`);
    log(`     汇总   : ${summary || '(无汇总)'}`);
    allFails.slice(0, 24).forEach((f) => log('      ' + f));
    if (allFails.length > 24) {
        log(`      …（其余 ${allFails.length - 24} 条见上方完整输出）`);
    }
    return { code: r.status, stdout, summary: summary || '', allFails };
}

log('=== CM-008 反向验证：回执轮询的可取消性是否可被测试区分 ===');
log('');
log(`回退来源 ref : ${BASE_REF}`);
log(`被测文件     : ${TARGETS.length} 个`);
log('提示：本验证含两处约 32s 超时窗口，全流程约 4 分钟。');

try {
    gitShow(BASE_REF, TARGETS[0]);
} catch (e) {
    log('');
    log(`ERROR: 无法从 ref '${BASE_REF}' 读取 ${TARGETS[0]}`);
    log(String(e.message || e));
    process.exit(2);
}

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

let baseline;
let reverted;
let restored;

try {
    baseline = runTest('已改造版本（预期通过）');

    log('');
    log('  ── 回退到改造前版本 ──');
    for (const t of TARGETS) {
        const abs = path.join(ROOT, t);
        copyFileSync(abs, path.join(BACKUP_DIR, path.basename(t) + '.bak'));
        writeFileSync(abs, gitShow(BASE_REF, t), 'utf8');
        log(`     已回退 : ${t}`);
    }

    reverted = runTest('回退版本（预期失败）');
} finally {
    log('');
    log('  ── 还原当前版本 ──');
    for (const t of TARGETS) {
        const bak = path.join(BACKUP_DIR, path.basename(t) + '.bak');
        if (!existsSync(bak)) continue;
        copyFileSync(bak, path.join(ROOT, t));
    }
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
    rmSync(BACKUP_DIR, { recursive: true, force: true });
}

// ── 结论 ──
//
// 判定"测试有区分力"必须同时满足：
//   1. 已改造版本通过（退出码 0 且汇总 0 failed）
//   2. 回退版本失败（退出码非 0）
//   3. 回退版本的失败**确由本轮改造点相关断言触发** ——
//      否则端口占用、Chrome 起不来等基础设施抖动会被误读成"测试有效"。
//
// 关键字分组：
//   - 取消能力：停止接口 / 句柄 / 轮询结束后不再排队
//   - 并发隔离：旧轮询不得覆盖新状态条、旧轮询不得继续发请求、代际失效
//   - 参数遮蔽：重命名与句柄接住等源码级检查
const CANCELLATION_MARKERS = [
    '提供 stopReceiptPolling 接口',
    'stop 后',
    '轮询句柄',
    '命中后轮询不再排队',
    '超时后轮询不再排队',
    '最终无活跃轮询'
];
const CONCURRENCY_MARKERS = [
    '旧轮询的超时分支',
    '旧轮询已停止发请求',
    '旧轮询已被失效',
    '同一时刻活跃轮询'
];
const SHADOW_MARKERS = ['遮蔽', 'statusName', '句柄接住', '终态会清空句柄'];

const countMatches = (fails, markers) =>
    fails ? fails.filter((l) => markers.some((m) => l.includes(m))) : [];

const cancelFails = countMatches(reverted && reverted.allFails, CANCELLATION_MARKERS);
const concurFails = countMatches(reverted && reverted.allFails, CONCURRENCY_MARKERS);
const shadowFails = countMatches(reverted && reverted.allFails, SHADOW_MARKERS);

log('');
log('=== 结论 ===');
log(`已改造版本退出码 : ${baseline ? baseline.code : '(未执行)'} (预期 0)`);
log(`已改造版本汇总   : ${baseline ? baseline.summary : '(未执行)'} (预期 0 failed)`);
log(`回退版本退出码   : ${reverted ? reverted.code : '(未执行)'} (预期非 0)`);
log(`回退版本汇总     : ${reverted ? reverted.summary : '(未执行)'}`);
log(`回退版本失败总数 : ${reverted ? reverted.allFails.length : 0}`);
log('');
log(`  取消能力类失败 : ${cancelFails.length} 条 (预期 > 0)`);
cancelFails.slice(0, 8).forEach((f) => log(`     - ${f}`));
log(`  并发隔离类失败 : ${concurFails.length} 条 (预期 > 0)`);
concurFails.slice(0, 8).forEach((f) => log(`     - ${f}`));
log(`  参数遮蔽类失败 : ${shadowFails.length} 条`);
shadowFails.slice(0, 8).forEach((f) => log(`     - ${f}`));
log('');
log(`源码已还原       : ${restored} (预期 true)`);

const baselineOk = baseline && baseline.code === 0 && /0 failed/.test(baseline.summary);
const revertedOk =
    reverted && reverted.code !== 0 && cancelFails.length > 0 && concurFails.length > 0;
const ok = baselineOk && revertedOk && restored === true;

log(
    `结果             : ${
        ok
            ? '通过——测试对「轮询不可取消」与「旧轮询覆盖新状态条」均有区分力'
            : '不通过——需检查（注意区分真缺陷与基础设施抖动）'
    }`
);

process.exit(ok ? 0 : 1);
