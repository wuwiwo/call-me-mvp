// 工作区防丢守卫（git hook 驱动）
//
// 作用
// ----
// 在 git 分支切换 / 合并 / 提交之后，自动识别并恢复「本次操作并不打算删除、
// 却被环境级联删除掉」的已跟踪文件。
//
// 为什么需要它
// ------------
// 本机 Windows 沙箱把「删除」改写为「移入回收站」，且对 rmdir 不校验目录是否为空。
// 而 git 在删除一个工作区文件后，会沿路径逐级 rmdir 祖先目录，并依赖
// 「目录非空 -> rmdir 失败」来终止这个循环（entry.c 的 remove_empty_directories）。
// 终止条件失效后，git 会一路把祖先目录全部删掉，直到工作树顶层为止；
// 之后 git 只重写本次需要写的文件，其余文件就表现为「静默消失」（`git status` 显示 ` D`）。
//
// 典型现场（回收站取证）：删除 docs/sub/extra.md 会连带产生
//   $I: docs\sub\extra.md -> docs\sub -> docs
// 三条记录，即 docs/ 整个目录被搬走。
//
// ★ 为什么不放在 tools/（GOV-002）
// ------------------------------
// 本文件原来住在 `tools/worktree-guard.mjs` —— 而 `tools/` 正是被级联搬走的目录之一。
// 结果是**守卫与被保护物同归于尽**：钩子报 MODULE_NOT_FOUND，恢复从未发生
// （CM-007、CM-008、CM-009、GOV-002 四次事故同一根因）。
//
// 现在做两层处理：
//   1. 权威版本移出 `tools/`，放到 `scripts/` —— 不再和被测工具挤在同一个被搬走的目录里；
//   2. **每次运行时把自身安装到 `.git/` 内**（`selfInstall()`）。
//      `.git/` 在工作树之外，级联删除搬不到它，因此即使整个工作树的副本全没了，
//      钩子仍能运行 `.git/` 里的那份并完成恢复。
// 钩子侧还有第三级：三级都不可用时用纯 git 做最小应急恢复。
//
// 判定规则
// --------
// 1. intended = git diff --diff-filter=D <prev> <new>
//    —— 本次切换/合并「本来就要删除」的文件，不恢复。
// 2. missing  = 索引里已跟踪、但工作区已不存在的文件。
// 3. collateral = missing - intended
//    —— 这些就是级联误伤，从索引恢复（内容仍在 HEAD/索引里，可完整还原）。
//
// 用法
// ----
// 由 .githooks/{post-checkout,post-merge,post-commit} 调用，一般不需要手动执行。
//   node scripts/worktree-guard.mjs post-checkout <prev> <new> <flag>
//   node scripts/worktree-guard.mjs post-merge <squash>
//   node scripts/worktree-guard.mjs post-commit
// 环境变量：
//   CALLME_WT_GUARD=0  临时关闭
//   CALLME_WT_ROOT     显式指定仓库根（钩子会传；从 .git/ 内运行时必需）
//
// 依赖：仅 Node 内置模块 + git。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.CALLME_WT_GUARD === '0') process.exit(0);

/** 解析仓库根：环境变量 → git → 脚本位置兜底。 */
function resolveRoot() {
    const fromEnv = process.env.CALLME_WT_ROOT;
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
    try {
        const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        if (top) return top;
    } catch {
        /* 落到兜底 */
    }
    return path.resolve(__dirname, '..');
}

const ROOT = resolveRoot();

/**
 * 把自身安装到 `.git/` 内（工作树之外）。
 *
 * 这是四次事故的根因修复：级联删除只会搬走**工作树里**的东西，
 * `.git/` 内的副本能幸存。若本脚本正是从那份副本运行的（说明工作树里的
 * 权威版本已被搬走），跳过即可 —— 不要把自己复制回自己。
 */
function selfInstall() {
    try {
        const self = fileURLToPath(import.meta.url);
        const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        if (!gitDir) return;
        const dest = path.join(gitDir, 'worktree-guard.mjs');
        if (path.resolve(self) === path.resolve(dest)) return;
        fs.writeFileSync(dest, fs.readFileSync(self));
    } catch {
        /* 自安装失败不影响本次恢复 */
    }
}

selfInstall();

const mode = process.argv[2] || '';

function git(args) {
    return execFileSync('git', args, {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

function revParseOrNull(ref) {
    try {
        return git(['rev-parse', '--verify', '--quiet', ref]).trim() || null;
    } catch {
        return null;
    }
}

function deletedBetween(a, b) {
    if (!a || !b || a === b) return new Set();
    try {
        return new Set(
            git(['diff', '--diff-filter=D', '--name-only', '-z', a, b]).split('\0').filter(Boolean)
        );
    } catch {
        return new Set();
    }
}

// ---- 1. 确定本次操作的 prev / new ----
let prev = null;
let head = null;
if (mode === 'post-checkout') {
    const flag = process.argv[5];
    if (flag !== '1') process.exit(0); // 只处理分支切换，不处理单文件检出
    prev = process.argv[3];
    head = process.argv[4];
} else if (mode === 'post-merge') {
    prev = revParseOrNull('ORIG_HEAD');
    head = revParseOrNull('HEAD');
} else if (mode === 'post-commit') {
    prev = revParseOrNull('HEAD~1');
    head = revParseOrNull('HEAD');
} else {
    process.exit(0);
}
if (!head) process.exit(0);

// ---- 2. 计算误伤集合 ----
const intended = deletedBetween(prev, head);
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
const missing = tracked.filter((p) => {
    const abs = path.join(ROOT, p);
    return !fs.existsSync(abs);
});
const collateral = missing.filter((p) => !intended.has(p));

if (collateral.length === 0) process.exit(0);

// ---- 3. 从索引恢复 ----
const restored = [];
const failed = [];
for (let i = 0; i < collateral.length; i += 50) {
    const chunk = collateral.slice(i, i + 50);
    try {
        git(['restore', '--', ...chunk]);
        restored.push(...chunk);
    } catch {
        // 整批失败时逐个试，避免一个坏路径拖累整批
        for (const p of chunk) {
            try {
                git(['restore', '--', p]);
                restored.push(p);
            } catch {
                failed.push(p);
            }
        }
    }
}

// ---- 4. 复检 ----
const stillMissing = restored.filter((p) => !fs.existsSync(path.join(ROOT, p)));

// ---- 5. 记录 + 报告 ----
const logDir = path.join(ROOT, '.workbuddy');
try {
    fs.mkdirSync(logDir, { recursive: true });
    const line =
        `[${new Date().toISOString()}] ${mode} prev=${(prev || '-').slice(0, 8)} ` +
        `head=${head.slice(0, 8)} intended=${intended.size} missing=${missing.length} ` +
        `restored=${restored.length} failed=${failed.length + stillMissing.length}\n` +
        restored.map((p) => `    + ${p}\n`).join('') +
        [...failed, ...stillMissing].map((p) => `    ! ${p}\n`).join('');
    fs.appendFileSync(path.join(logDir, 'worktree-guard.log'), line);
} catch {
    /* 日志失败不影响主流程 */
}

process.stderr.write(
    '\n' +
        '==============================================================\n' +
        '  ⚠️  工作区防丢守卫：检测到级联删除并已恢复\n' +
        '--------------------------------------------------------------\n' +
        `  触发      : ${mode}\n` +
        `  本次应删  : ${intended.size} 个（已跳过，不恢复）\n` +
        `  级联误伤  : ${collateral.length} 个\n` +
        '--------------------------------------------------------------\n' +
        restored.map((p) => `  恢复 ${p}\n`).join('') +
        [...failed, ...stillMissing].map((p) => `  失败 ${p}\n`).join('') +
        '--------------------------------------------------------------\n' +
        '  原因：本机沙箱把 rmdir 改写成「移入回收站」且不校验目录是否为空，\n' +
        '        git 沿路径上溯清理空目录的终止条件失效所致。\n' +
        '  详细：docs/handoff/archive/WORKTREE-FILE-LOSS.md\n' +
        '  日志：.workbuddy/worktree-guard.log\n' +
        '==============================================================\n\n'
);

process.exit(0); // 永不阻断 git
