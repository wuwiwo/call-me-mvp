// /tools/run-all.mjs
//
// CM-009 统一测试入口：一条命令串行跑完 lint + 11 个回归套件 + 工作区完整性检查。
// （S2 起新增 theme-layer、S3 起新增 theme-entry、S4 起新增 components；
//   套件清单见下面 BROWSER_SUITES）
//
// 运行方式：
//   node tools/run-all.mjs                 # 全量（含浏览器套件，约 6–10 分钟）
//   node tools/run-all.mjs --skip-browser  # 快速路径：只跑 lint + check-worktree
//   CM009_SKIP_BROWSER=1 node tools/run-all.mjs   # 同上（环境变量形式）
//   npm test                               # 等价于第一种
//   npm run test:quick                     # 等价于第二种
//
// 为什么**必须串行**：所有套件都用 HTTP 8899 端口（各自进程内起静态服务器），
// 并行会互相抢端口。这里逐个 spawnSync，天然串行。
//
// 为什么 lint 用 `node node_modules/eslint/bin/eslint.js .` 而不是 `npx eslint` /
// `eslint`：本机 `node_modules/.bin/*` 是 POSIX shim，依赖 `dirname`，必然失败
// （`dirname: command not found`）。直接调**真实入口**在本机与 CI 上行为一致。
//
// 为什么 check-worktree 放在**最后**：它兼作"跑完这一轮之后工作区仍完好"的收口检查。
// 本机存在「checkout/merge/写文件触发级联删除」的环境缺陷（详见
// docs/handoff/archive/WORKTREE-FILE-LOSS.md），把完整性检查放在末尾能捕捉到
// 本轮运行期间发生的丢失。
//
// 退出码：全部通过 = 0；**任一项失败或超时 = 1**。
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 快速路径既支持环境变量、也支持命令行开关：
// npm scripts 里写 `VAR=1 node ...` 在 Windows 上不生效，故额外提供 CLI 开关。
const ARGS = new Set(process.argv.slice(2));
const SKIP_BROWSER = process.env.CM009_SKIP_BROWSER === '1' || ARGS.has('--skip-browser');
const VERBOSE = process.env.CM009_VERBOSE === '1' || ARGS.has('--verbose');
const LOG_PATH = process.env.CM009_LOG || '';

// 单项超时：默认 15 分钟（最慢的 receipt-lifecycle 约 2 分钟；
// 留足余量，同时避免 Chrome 卡死时永久挂住）
const ITEM_TIMEOUT_MS = Number(process.env.CM009_ITEM_TIMEOUT_MS || 15 * 60 * 1000);

const NODE = process.execPath;

// ── 输出收集（同时打印到 stdout，便于 CM009_LOG 落盘） ──
// 本文件所有输出都必须走 out()：直接 console.log 的话，日志文件会是空的。
const collected = [];
function out(line = '') {
    collected.push(line);
    process.stdout.write(line + '\n');
}

// ── 用例清单 ──
// 顺序：lint → 11 套件 → check-worktree
const LINT_ITEM = {
    id: 'lint',
    label: 'lint（ESLint）',
    argv: ['node_modules/eslint/bin/eslint.js', '.']
};

const BROWSER_SUITES = [
    { id: 'e2e', label: 'e2e（CM-002）', argv: ['tools/e2e.mjs'] },
    {
        id: 'storage-resilience',
        label: 'storage-resilience（CM-003）',
        argv: ['tools/storage-resilience.mjs']
    },
    { id: 'button-ids', label: 'button-ids（CM-004）', argv: ['tools/button-ids.mjs'] },
    { id: 'input-safety', label: 'input-safety（CM-005）', argv: ['tools/input-safety.mjs'] },
    { id: 'cooldown', label: 'cooldown（CM-006）', argv: ['tools/cooldown.mjs'] },
    {
        id: 'history-language',
        label: 'history-language（CM-007）',
        argv: ['tools/history-language.mjs']
    },
    {
        id: 'receipt-lifecycle',
        label: 'receipt-lifecycle（CM-008）',
        argv: ['tools/receipt-lifecycle.mjs']
    },
    { id: 'password-gate', label: 'password-gate（CM-010）', argv: ['tools/password-gate.mjs'] },
    { id: 'theme-layer', label: 'theme-layer（S2）', argv: ['tools/theme-layer.mjs'] },
    { id: 'theme-entry', label: 'theme-entry（S3）', argv: ['tools/theme-entry.mjs'] },
    { id: 'components', label: 'components（S4）', argv: ['tools/components.mjs'] }
];

const WORKTREE_ITEM = {
    id: 'check-worktree',
    label: 'check-worktree（工作区完整性）',
    argv: ['tools/check-worktree.mjs']
};

const ITEMS = SKIP_BROWSER
    ? [LINT_ITEM, WORKTREE_ITEM]
    : [LINT_ITEM, ...BROWSER_SUITES, WORKTREE_ITEM];

// ── 摘要提取 ──
// 各套件的汇总行格式不完全相同，这里按优先级从后往前找最像"结论"的那一行。
function extractSummary(text) {
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i--) {
        if (/断言[:：]/.test(lines[i]) && /passed/.test(lines[i])) return lines[i];
    }
    for (let i = lines.length - 1; i >= 0; i--) {
        if (/未发现被删除的已跟踪文件/.test(lines[i])) return lines[i];
    }
    for (let i = lines.length - 1; i >= 0; i--) {
        if (/缺失/.test(lines[i])) return lines[i];
    }
    for (let i = lines.length - 1; i >= 0; i--) {
        if (/problem/i.test(lines[i])) return lines[i];
    }
    return '';
}

/** 从汇总行里抠出「N passed, M failed」，用于最后合计。 */
function extractCounts(summary) {
    const m = /(\d+)\s*passed\s*,\s*(\d+)\s*failed/.exec(summary || '');
    if (!m) return null;
    return { passed: Number(m[1]), failed: Number(m[2]) };
}

function tail(text, n) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    return lines.slice(Math.max(0, lines.length - n));
}

// ── 执行 ──
const started = Date.now();
const results = [];

out('=== CM-009 统一测试入口 ===');
out(`环境：${os.platform()} / ${NODE} / node ${process.version} / 串行执行`);
out(
    `模式：${SKIP_BROWSER ? '快速（CM009_SKIP_BROWSER=1，仅 lint + check-worktree）' : `完整（${ITEMS.length} 项，含浏览器套件）`}`
);
out(`根目录：${ROOT}`);
out('');

ITEMS.forEach((item, idx) => {
    const tag = `[${idx + 1}/${ITEMS.length}] ${item.label}`;
    out('─'.repeat(72));
    out(tag);
    out('─'.repeat(72));

    const t0 = Date.now();
    const r = spawnSync(NODE, item.argv, {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: ITEM_TIMEOUT_MS,
        // 继承环境：各套件的 CM00x_* 覆盖（端口 / Chrome / LOG）继续可用
        env: process.env
    });
    const elapsed = Date.now() - t0;

    const stdout = r.stdout || '';
    const stderr = r.stderr || '';
    const timedOut = r.error && r.error.code === 'ETIMEDOUT';
    const exitCode = timedOut ? 'timeout' : r.status;

    if (VERBOSE) {
        // 逐套件实时全量输出（默认关闭，避免刷屏）。
        // 同时收进 collected，否则 CM009_LOG 里会缺掉原始输出，
        // 而 CI 上恰恰最需要这份完整日志。
        process.stdout.write(stdout);
        process.stderr.write(stderr);
        collected.push(stdout);
        if (stderr) collected.push(stderr);
    }

    const summary = extractSummary(stdout + '\n' + stderr);
    const failLines = [...stdout.split(/\r?\n/), ...stderr.split(/\r?\n/)]
        .filter((l) => l.includes('FAIL'))
        .map((l) => l.trim());

    const ok = !timedOut && r.status === 0;
    results.push({ item, ok, exitCode, summary, elapsed, failLines, stdout, stderr });

    out(
        `      退出码 : ${exitCode}${timedOut ? `（超过 ${Math.round(ITEM_TIMEOUT_MS / 1000)}s 未结束，已终止）` : ''}`
    );
    out(`      汇总   : ${summary || '(未识别到汇总行)'}`);
    out(`      耗时   : ${(elapsed / 1000).toFixed(1)}s`);
    out(`      结果   : ${ok ? 'PASS' : 'FAIL'}`);

    if (!ok) {
        if (failLines.length) {
            out(`      失败项（共 ${failLines.length} 条，最多显示 20 条）：`);
            failLines.slice(0, 20).forEach((l) => out('        ' + l));
            if (failLines.length > 20) {
                out(`        …（其余 ${failLines.length - 20} 条见完整输出）`);
            }
        } else {
            out('      输出末尾 15 行：');
            tail(stdout + '\n' + stderr, 15).forEach((l) => out('        ' + l));
        }
    }
    out('');
});

// ── 汇总 ──
const totalSec = (Date.now() - started) / 1000;
const failed = results.filter((r) => !r.ok);
const passCount = results.length - failed.length;

let aggPassed = 0;
let aggFailed = 0;
let aggItems = 0;
for (const r of results) {
    const c = extractCounts(r.summary);
    if (c) {
        aggPassed += c.passed;
        aggFailed += c.failed;
        aggItems += 1;
    }
}

out('='.repeat(72));
out('=== 总览 ===');
out('='.repeat(72));
for (const r of results) {
    const idx = results.indexOf(r) + 1;
    const mark = r.ok ? 'PASS' : 'FAIL';
    out(
        `  ${String(idx).padStart(2)}. ${mark}  ${r.item.label.padEnd(34)} ` +
            `exit=${String(r.exitCode).padEnd(7)} ${(r.elapsed / 1000).toFixed(1)}s  ${r.summary}`
    );
}
out('');
out(`项数   : ${passCount}/${results.length} 通过`);
if (aggItems > 0) {
    out(`断言   : 合计 ${aggPassed} 项，失败 ${aggFailed} 项（覆盖 ${aggItems} 个含断言汇总的项）`);
}
out(`总耗时 : ${totalSec.toFixed(1)}s`);
if (failed.length) {
    out('');
    out(`失败项 : ${failed.map((r) => r.item.label).join('、')}`);
    out('定位   : 见上方对应小节标出的「失败项」/「输出末尾」');
}
out('');
out(
    failed.length === 0 ? '结果：全部通过（退出码 0）' : `结果：${failed.length} 项失败（退出码 1）`
);

if (LOG_PATH) {
    try {
        mkdirSync(path.dirname(path.resolve(LOG_PATH)), { recursive: true });
        writeFileSync(LOG_PATH, collected.join('\n') + '\n', 'utf8');
        console.error(`\n[日志] 已写入 ${LOG_PATH}`);
    } catch (e) {
        console.error(`\n[日志] 写入失败：${e.message}`);
    }
}

process.exit(failed.length === 0 ? 0 : 1);
