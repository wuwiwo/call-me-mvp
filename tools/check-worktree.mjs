// 工作区完整性检查 —— 检出「已跟踪文件在工作区被删除」的情况。
//
// 运行方式：
//   node tools/check-worktree.mjs           # 只检查并报告
//   node tools/check-worktree.mjs --fix     # 检查并自动从 HEAD 恢复被删除的文件
//
// 为什么需要它
// ------------
// 本仓库在 Windows 上反复出现「已跟踪文件在工作区消失」：
//   - 2026-09-17 17:57  治理文档合并后丢失 5 个 docs/*.md
//   - 2026-09-17 21:22  CM-003 合并窗口丢失 storage-resilience.mjs / negative-storage.mjs
//   - 2026-09-17 22:38  CM-004 合并后丢失 button-ids.mjs 等
//   - 2026-09-18 16:27  CM-005/GOV-001 合并后丢失 17 个文件（docs/*.md + tools/*.mjs）
//
// 根因（有回收站证据）：**不是 git 删除的**。git 在 Windows 上不使用回收站；
// 而本机带「安全删除」shim 的外部工具会把删除的文件移入 `E:\$RECYCLE.BIN`。
// 回收站 `$I*` 元数据里完整记录了上述删除，包含 `docs`、`tools` 目录本身，
// 甚至 `.git/index.lock`、`HEAD.lock`、`packed-refs.lock`。
// 每次 git 合并/检出动作前后，都有一个外部工具在对这些目录执行「删除到回收站」，
// 而 git 随后只重写了它需要写的文件 —— 没被重写的就成了「丢失」，表现为 ` D`。
// 详细记录见 `docs/handoff/archive/WORKTREE-FILE-LOSS.md`。
//
// 危害与防护
// ----------
// 危害不在「内容丢失」（内容都在 HEAD 里，可完整恢复），而在两点：
//   1. 验证跑不起来（`MODULE_NOT_FOUND`），容易被误判成「代码回归」；
//   2. **若顺手 `git add -A` 提交，就会把工作区损坏固化进历史**。
// 因此：合并/检出之后、提交之前，先跑本脚本。
//
// 依赖：仅 Node 内置模块。
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FIX = process.argv.includes("--fix");

function git(args) {
    return execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    });
}

const porcelain = git(["status", "--porcelain"]);
const lines = porcelain.split(/\r?\n/).filter(l => l.trim());

// ` D` = 工作区已删除、未暂存（本次要处理的典型症状）
// `D ` = 已暂存删除（更危险：一个 commit 就会固化）
const unstagedDeleted = [];
const stagedDeleted = [];
for (const l of lines) {
    const code = l.slice(0, 2);
    const p = l.slice(3).trim();
    if (code === " D") unstagedDeleted.push(p);
    else if (code === "D ") stagedDeleted.push(p);
    else if (code === "DD") stagedDeleted.push(p);
}

console.log("=== 工作区完整性检查 ===");
console.log(`仓库：${ROOT}`);
console.log("");

if (unstagedDeleted.length === 0 && stagedDeleted.length === 0) {
    console.log("未发现被删除的已跟踪文件。工作区正常。");
    process.exit(0);
}

if (unstagedDeleted.length) {
    console.log(`发现 ${unstagedDeleted.length} 个已跟踪文件在工作区缺失（未暂存）：`);
    unstagedDeleted.forEach(p => console.log("   D " + p));
    console.log("");
}
if (stagedDeleted.length) {
    console.log(`发现 ${stagedDeleted.length} 个已跟踪文件的删除已被暂存：`);
    stagedDeleted.forEach(p => console.log("   D  " + p));
    console.log("");
    console.log("注意：已暂存的删除会被下一次 commit 固化。除非这是有意删除，应先恢复。");
    console.log("");
}

console.log("这是本仓库的已知环境问题（外部工具把文件移入回收站）。");
console.log("内容仍在 HEAD 中，可完整恢复。详见 docs/handoff/archive/WORKTREE-FILE-LOSS.md");
console.log("");

if (!FIX) {
    console.log("未做改动。要自动恢复，请运行：");
    console.log("   node tools/check-worktree.mjs --fix");
    console.log("");
    console.log("提示：在 git 合并/检出之后、任何 commit 之前跑一次本脚本。");
    console.log("切勿用 `git add -A` —— 那会把工作区损坏一起提交。");
    process.exit(1);
}

const targets = [...unstagedDeleted, ...stagedDeleted];
if (targets.length) {
    console.log(`--fix：从 HEAD 恢复 ${targets.length} 个路径…`);
    // 先取消暂存的删除，再把工作区文件恢复出来
    if (stagedDeleted.length) {
        git(["restore", "--staged", "--", ...stagedDeleted]);
    }
    git(["restore", "--", ...targets]);
    console.log("恢复完成。");
}

const after = git(["status", "--porcelain"])
    .split(/\r?\n/)
    .filter(l => /^( D|D |DD)/.test(l));
console.log("");
if (after.length === 0) {
    console.log("复检通过：已无被删除的已跟踪文件。");
    process.exit(0);
}
console.log(`复检仍有 ${after.length} 个未恢复：`);
after.forEach(l => console.log("   " + l));
process.exit(1);
