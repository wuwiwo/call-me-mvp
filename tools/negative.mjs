// CM-002 反向验证：证明 E2E 脚本确实覆盖该缺陷
// 做法：把已提交的修复临时回退成 buggy 版本，重跑 e2e.mjs，应看到步骤 4 失败；
//       无论结果如何都恢复修复版本（try/finally 保证）。
//
// 用法（需先起 tools/server.mjs）：node tools/negative.mjs
//
// 注意：目标文件是 CRLF 行尾，故这里按行数组操作，不依赖行尾符。
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "js/modules/buttonManager.js");
const BACKUP = path.join(ROOT, "tools/.backup_buttonManager.js");
const E2E = path.join(ROOT, "tools/e2e.mjs");

const BUGGY_BLOCK = [
    "        // 设置选中图标",
    '        if (buttonData?.icon && buttonData.icon !== "random") {',
    '            form.querySelector(".icon-selector").value = buttonData.icon;',
    "        }",
];

const original = readFileSync(TARGET, "utf8");

// 按行切分（保留行尾符），定位并替换注释块
const lines = original.split("\n");
const startIdx = lines.findIndex(l => l.includes("图标回显由 createIconPicker"));
if (startIdx === -1) {
    console.error("未找到修复注释块，中止。");
    process.exit(2);
}
// 修复块 = 两行注释 + 紧随的一个空行
const eol = lines[startIdx].endsWith("\r") ? "\r" : "";
const commentBlock = lines.slice(startIdx, startIdx + 2);
if (!commentBlock[1].includes("trigger 图标、label 与 data-value")) {
    console.error("修复注释块结构不符，中止。", JSON.stringify(commentBlock));
    process.exit(2);
}

const buggyLines = BUGGY_BLOCK.map(l => l + eol);
const patchedLines = [
    ...lines.slice(0, startIdx),
    ...buggyLines,
    ...lines.slice(startIdx + 2),
];
const buggySrc = patchedLines.join("\n");

if (buggySrc === original || !buggySrc.includes(".icon-selector")) {
    console.error("替换未生效，中止。");
    process.exit(2);
}

console.log("=== CM-002 反向验证 ===\n");
console.log("1) 备份当前（已修复）版本");
copyFileSync(TARGET, BACKUP);

let exitCode;
try {
    console.log("2) 临时回退为 buggy 版本");
    writeFileSync(TARGET, buggySrc, "utf8");

    console.log("3) 重跑 e2e.mjs（预期步骤 4 失败，整体非 0 退出）\n");
    const r = spawnSync(process.execPath, [E2E], {
        stdio: "inherit",
        env: process.env,
    });
    exitCode = r.status ?? 1;

    console.log("\n4) buggy 版本退出码 =", exitCode);
    if (exitCode === 0) {
        console.log("   警告：buggy 版本竟然全部通过 —— 说明测试未覆盖该缺陷！");
    } else {
        console.log("   符合预期：测试确实捕获到该缺陷。");
    }
} finally {
    console.log("\n5) 恢复已修复版本");
    copyFileSync(BACKUP, TARGET);
    unlinkSync(BACKUP);
    const restored = readFileSync(TARGET, "utf8");
    console.log(
        "   恢复校验：含 .icon-selector =",
        restored.includes(".icon-selector"),
        "；工作区已还原 =",
        restored === original
    );
}

process.exit(exitCode === 0 ? 1 : 0);
