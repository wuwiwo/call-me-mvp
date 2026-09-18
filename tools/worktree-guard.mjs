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
//   node tools/worktree-guard.mjs post-checkout <prev> <new> <flag>
//   node tools/worktree-guard.mjs post-merge <squash>
//   node tools/worktree-guard.mjs post-commit
// 环境变量 CALLME_WT_GUARD=0 可临时关闭。
//
// 依赖：仅 Node 内置模块 + git。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

if (process.env.CALLME_WT_GUARD === "0") process.exit(0);

const mode = process.argv[2] || "";

function git(args) {
    return execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function revParseOrNull(ref) {
    try {
        return git(["rev-parse", "--verify", "--quiet", ref]).trim() || null;
    } catch {
        return null;
    }
}

function deletedBetween(a, b) {
    if (!a || !b || a === b) return new Set();
    try {
        return new Set(
            git(["diff", "--diff-filter=D", "--name-only", "-z", a, b])
                .split("\0")
                .filter(Boolean)
        );
    } catch {
        return new Set();
    }
}

// ---- 1. 确定本次操作的 prev / new ----
let prev = null;
let head = null;
if (mode === "post-checkout") {
    const flag = process.argv[5];
    if (flag !== "1") process.exit(0); // 只处理分支切换，不处理单文件检出
    prev = process.argv[3];
    head = process.argv[4];
} else if (mode === "post-merge") {
    prev = revParseOrNull("ORIG_HEAD");
    head = revParseOrNull("HEAD");
} else if (mode === "post-commit") {
    prev = revParseOrNull("HEAD~1");
    head = revParseOrNull("HEAD");
} else {
    process.exit(0);
}
if (!head) process.exit(0);

// ---- 2. 计算误伤集合 ----
const intended = deletedBetween(prev, head);
const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const missing = tracked.filter(p => {
    const abs = path.join(ROOT, p);
    return !fs.existsSync(abs);
});
const collateral = missing.filter(p => !intended.has(p));

if (collateral.length === 0) process.exit(0);

// ---- 3. 从索引恢复 ----
const restored = [];
const failed = [];
for (let i = 0; i < collateral.length; i += 50) {
    const chunk = collateral.slice(i, i + 50);
    try {
        git(["restore", "--", ...chunk]);
        restored.push(...chunk);
    } catch (e) {
        // 整批失败时逐个试，避免一个坏路径拖累整批
        for (const p of chunk) {
            try {
                git(["restore", "--", p]);
                restored.push(p);
            } catch {
                failed.push(p);
            }
        }
    }
}

// ---- 4. 复检 ----
const stillMissing = restored.filter(p => !fs.existsSync(path.join(ROOT, p)));

// ---- 5. 记录 + 报告 ----
const logDir = path.join(ROOT, ".workbuddy");
try {
    fs.mkdirSync(logDir, { recursive: true });
    const line =
        `[${new Date().toISOString()}] ${mode} prev=${(prev || "-").slice(0, 8)} ` +
        `head=${head.slice(0, 8)} intended=${intended.size} missing=${missing.length} ` +
        `restored=${restored.length} failed=${failed.length + stillMissing.length}\n` +
        restored.map(p => `    + ${p}\n`).join("") +
        [...failed, ...stillMissing].map(p => `    ! ${p}\n`).join("");
    fs.appendFileSync(path.join(logDir, "worktree-guard.log"), line);
} catch {
    /* 日志失败不影响主流程 */
}

process.stderr.write(
    "\n" +
    "==============================================================\n" +
    "  ⚠️  工作区防丢守卫：检测到级联删除并已恢复\n" +
    "--------------------------------------------------------------\n" +
    `  触发      : ${mode}\n` +
    `  本次应删  : ${intended.size} 个（已跳过，不恢复）\n` +
    `  级联误伤  : ${collateral.length} 个\n` +
    "--------------------------------------------------------------\n" +
    restored.map(p => `  恢复 ${p}\n`).join("") +
    [...failed, ...stillMissing].map(p => `  失败 ${p}\n`).join("") +
    "--------------------------------------------------------------\n" +
    "  原因：本机沙箱把 rmdir 改写成「移入回收站」且不校验目录是否为空，\n" +
    "        git 沿路径上溯清理空目录的终止条件失效所致。\n" +
    "  详细：docs/handoff/archive/WORKTREE-FILE-LOSS.md\n" +
    "  日志：.workbuddy/worktree-guard.log\n" +
    "==============================================================\n\n"
);

process.exit(0); // 永不阻断 git
