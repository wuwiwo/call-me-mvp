// CM-004 反向验证（手工工具，不纳入普通 CI）
//
// 流程：临时回退按钮 ID 修复 → 重跑 tools/button-ids.mjs（预期失败）→ 无条件还原。
//
// 运行：node tools/negative-button-ids.mjs
// 退出码：0 = 反向验证通过（测试对缺陷有区分力）；非 0 = 不通过
//
// 注意：本脚本会临时改写 js/modules/ 下的业务源码，因此
//   - 标记为手工工具，不应纳入普通 CI
//   - 用 try/finally 保证异常中断时也会还原
//   - 不使用 git stash（2026-09-17 曾因 stash 损坏 .git/refs 与对象库）
//   - 备份放在 .workbuddy/cm004_backup/（运行时产物，由本脚本创建/清理）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "js", "modules");
const BACKUP = path.join(ROOT, ".workbuddy", "cm004_backup");
const NODE = process.execPath;
const FILES = ["buttonManager.js", "config.js"];

fs.mkdirSync(BACKUP, { recursive: true });

// 仓库内 .js 为 CRLF 行尾，读取后归一化为 LF 做匹配，写回时还原
const CRLF = "\r\n";
const readNorm = p => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const writeCRLF = (p, s) => fs.writeFileSync(p, s.replace(/\n/g, CRLF), "utf8");

function snapshotFixed() {
    for (const f of FILES) {
        fs.copyFileSync(path.join(SRC, f), path.join(BACKUP, f));
    }
    console.log("[备份] 修复版本快照 ->", BACKUP);
}

function restoreFixed() {
    for (const f of FILES) {
        fs.copyFileSync(path.join(BACKUP, f), path.join(SRC, f));
    }
    console.log("[还原] 已恢复修复版本");
}

/**
 * 回退 CM-004 的三处修复，还原到修复前的行为：
 * 1. saveButtonConfig 默认按钮 ID 回到按位置生成 `default_N`
 * 2. saveButtonConfig 自定义按钮 ID 回到每次重新生成 `custom_${Date.now()}`
 * 3. loadButtonConfig 不再归一化 legacy `default_N`（去掉 normalizeButtonIds 调用）
 */
function revertFix() {
    const p = path.join(SRC, "buttonManager.js");
    let s = readNorm(p);

    // ③ 去掉读取阶段的归一化
    const normCall = `        this.customButtons = Array.isArray(buttons)
            ? this.normalizeButtonIds(buttons)
            : JSON.parse(JSON.stringify(CONFIG.buttons.defaultButtons));`;
    const normOrig = `        this.customButtons = Array.isArray(buttons)
            ? buttons
            : JSON.parse(JSON.stringify(CONFIG.buttons.defaultButtons));`;
    if (!s.includes(normCall)) throw new Error("buttonManager.js 未找到归一化调用");
    s = s.replace(normCall, normOrig);

    // ① 默认按钮 ID 回到按位置生成
    const defId = `            newButtons.push({
                ...preserved,
                id: defaultBtn.id,
                message: textInput?.value.trim() || defaultBtn.message,
                icon: iconPicker?.dataset.value || defaultBtn.icon
            });`;
    const defIdOrig = `            newButtons.push({
                ...preserved,
                id: \`default_\${index + 1}\`,
                message: textInput?.value.trim() || defaultBtn.message,
                icon: iconPicker?.dataset.value || defaultBtn.icon
            });`;
    if (!s.includes(defId)) throw new Error("buttonManager.js 未找到默认按钮 ID 片段");
    s = s.replace(defId, defIdOrig);

    // ② 自定义按钮 ID 回到每次重新生成
    const cusId = `                    id: carried || this.createCustomButtonId(newButtons),`;
    const cusIdOrig = `                    id: \`custom_\${Date.now()}\`,`;
    if (!s.includes(cusId)) throw new Error("buttonManager.js 未找到自定义按钮 ID 片段");
    s = s.replace(cusId, cusIdOrig);

    writeCRLF(p, s);
    console.log("[回退] buttonManager.js -> 按位置默认 ID + 每次重生成自定义 ID + 不归一化");
}

function runTest(logName) {
    const env = { ...process.env, CM004_LOG: path.join(ROOT, "tools", logName) };
    const p = spawnSync(NODE, ["tools/button-ids.mjs"], {
        cwd: ROOT,
        encoding: "utf8",
        env,
        timeout: 300000,
    });
    const lines = (p.stdout || "").trim().split("\n");
    console.log(lines.slice(-20).join("\n"));
    console.log("退出码:", p.status);
    return p.status;
}

console.log("=".repeat(62));
console.log("步骤1：确认修复版本测试通过（基线）");
console.log("=".repeat(62));
snapshotFixed();
const baseRc = runTest("RUN_button_ids.log");
if (baseRc !== 0) {
    console.log("\n!! 基线未通过，反向验证无意义。");
    process.exit(2);
}

console.log();
console.log("=".repeat(62));
console.log("步骤2：临时回退修复，重跑同一测试（预期失败）");
console.log("=".repeat(62));
let negRc;
try {
    revertFix();
    negRc = runTest("RUN_negative_button_ids.log");
} finally {
    console.log();
    console.log("=".repeat(62));
    console.log("步骤3：无条件还原修复版本");
    console.log("=".repeat(62));
    restoreFixed();
}

console.log();
console.log("=".repeat(62));
console.log("反向验证结论");
console.log("=".repeat(62));
console.log("修复版本退出码 :", baseRc, "(预期 0)");
console.log("回退版本退出码 :", negRc, "(预期非 0)");
const ok = baseRc === 0 && negRc !== 0;
console.log("结果           :", ok ? "通过——测试对缺陷有区分力" : "不通过——测试无区分力");
process.exit(ok ? 0 : 1);
