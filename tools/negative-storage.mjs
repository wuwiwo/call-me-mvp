// CM-003 反向验证（手工工具，不纳入普通 CI）
//
// 流程：临时回退修复 → 重跑 tools/storage-resilience.mjs（预期失败）→ 无条件还原修复版本。
//
// 运行：node tools/negative-storage.mjs
// 退出码：0 = 反向验证通过（测试对缺陷有区分力）；非 0 = 不通过
//
// 注意：本脚本会临时改写 js/modules/ 下的业务源码，因此
//   - 标记为手工工具，不应纳入普通 CI
//   - 用 try/finally 保证异常中断时也会还原
//   - 不使用 git stash（2026-09-17 曾因 stash 损坏 .git/refs 与对象库）
//   - 备份依赖 .workbuddy/cm003_backup/（由修复版本写入）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'js', 'modules');
const BACKUP = path.join(ROOT, '.workbuddy', 'cm003_backup');
const NODE = process.execPath;
const FILES = ['state.js', 'history.js', 'buttonManager.js', 'notification.js'];

fs.mkdirSync(BACKUP, { recursive: true });

/** 备份当前（已修复）源码，作为还原来源 */
// 仓库内 .js 为 CRLF 行尾（见项目记忆），因此：
//   - 读取后统一转成 LF 做匹配，写回时再还原为 CRLF
//   - 绝不用含 \n 的固定字符串去匹配 CRLF 文件
const CRLF = '\r\n';

function readNorm(p) {
    return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}
function writeCRLF(p, s) {
    fs.writeFileSync(p, s.replace(/\n/g, CRLF), 'utf8');
}

function snapshotFixed() {
    for (const f of FILES) {
        fs.copyFileSync(path.join(SRC, f), path.join(BACKUP, f));
    }
    console.log('[备份] 已修复版本快照 ->', BACKUP);
}

function restoreFixed() {
    for (const f of FILES) {
        fs.copyFileSync(path.join(BACKUP, f), path.join(SRC, f));
    }
    console.log('[还原] 已恢复修复版本');
}

function revertFix() {
    // state.js：移除 readJsonSafe，改回直接 JSON.parse
    {
        const p = path.join(SRC, 'state.js');
        let s = readNorm(p);
        const start = s.indexOf('/**\n * 安全读取并解析 LocalStorage 中的 JSON。');
        const end = s.indexOf('export const state = {');
        if (start === -1 || end === -1) throw new Error('state.js 结构不符合预期');
        s = s.slice(0, start) + s.slice(end);
        const fixed = `        this.userProfile = readJsonSafe(
            'userProfile',
            null,
            v => v !== null && typeof v === 'object' && !Array.isArray(v)
        );`;
        const orig = `        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
            this.userProfile = JSON.parse(savedProfile);
        }`;
        if (!s.includes(fixed)) throw new Error('state.js 未找到修复片段');
        s = s.replace(fixed, orig);
        writeCRLF(p, s);
        console.log('[回退] state.js -> 直接 JSON.parse');
    }

    // history.js：移除 helper 导入，改回直接 JSON.parse
    {
        const p = path.join(SRC, 'history.js');
        let s = readNorm(p);
        s = s.replace(
            "import { utils } from './utils.js';\nimport { readJsonSafe } from './state.js';",
            "import { utils } from './utils.js';"
        );
        const fixed = `        // 损坏或类型错误时回退为空数组，历史页仍可加载并显示空状态
        const records = readJsonSafe(
            'notificationHistory',
            [],
            v => Array.isArray(v)
        );`;
        const orig = `        const records = JSON.parse(localStorage.getItem('notificationHistory')) || [];`;
        if (!s.includes(fixed)) throw new Error('history.js 未找到修复片段');
        s = s.replace(fixed, orig);
        writeCRLF(p, s);
        console.log('[回退] history.js -> 直接 JSON.parse');
    }

    // buttonManager.js：恢复原始 try/catch 版本
    {
        const p = path.join(SRC, 'buttonManager.js');
        let s = readNorm(p);
        s = s.replace(
            `import {
    state,
    readJsonSafe
} from "./state.js";`,
            `import {
    state
} from "./state.js";`
        );
        const start = s.indexOf(
            '    /**\n     * 从localStorage加载按钮配置\n     *\n     * 非法 JSON'
        );
        const end = s.indexOf('    /**\n     * 保存当前配置到localStorage');
        if (start === -1 || end === -1) throw new Error('buttonManager.js 结构不符合预期');
        const original = `    /**
     * 从localStorage加载按钮配置
     */
    loadButtonConfig() {
        try {
            const savedConfig = localStorage.getItem("buttonConfig");
            if (savedConfig) {
                const {
                    buttons,
                    activeGroup
                } = JSON.parse(savedConfig);
                this.customButtons = buttons || [];
                this.activeButtonGroup = activeGroup || "default";
            } else {
                // 使用默认配置
                this.customButtons = JSON.parse(
                    JSON.stringify(CONFIG.buttons.defaultButtons)
                );
                this.saveConfig();
            }
        } catch (e) {
            console.error("Failed to load button config:", e);
            this.resetToDefault();
        }
    },

`;
        s = s.slice(0, start) + original + s.slice(end);
        writeCRLF(p, s);
        console.log('[回退] buttonManager.js -> 原始 try/catch');
    }

    // notification.js：移除 helper 导入，改回直接 JSON.parse（写入路径缺陷）
    {
        const p = path.join(SRC, 'notification.js');
        let s = readNorm(p);
        s = s.replace(
            `import {
    state,
    readJsonSafe
} from './state.js';`,
            `import {
    state
} from './state.js';`
        );
        const start = s.indexOf('    // 添加历史记录\n    //\n    // 这是写入路径');
        const end = s.indexOf('// 发送Webhook通知');
        if (start === -1 || end === -1) throw new Error('notification.js 结构不符合预期');
        const original = `    // 添加历史记录
    addHistoryRecord(message, isSuccess) {
        const history = JSON.parse(localStorage.getItem("notificationHistory")) || [];
        history.unshift({
            timestamp: new Date().toISOString(),
            message,
            nickname: state.userProfile?.nickname || utils.getTranslation("common.unregistered"),
            emoji: state.userProfile?.emoji || CONFIG.defaultAvatar,
            _status: isSuccess ? "success" : "error",
            webhook: CONFIG.webhookUrl
        });
        localStorage.setItem(
            "notificationHistory",
            JSON.stringify(history.slice(0, CONFIG.maxHistoryRecords))
        );
    },

`;
        s = s.slice(0, start) + original + s.slice(end);
        writeCRLF(p, s);
        console.log('[回退] notification.js -> 直接 JSON.parse');
    }
}

function runTest(logName) {
    const env = { ...process.env, CM003_LOG: path.join(ROOT, 'tools', logName) };
    const p = spawnSync(NODE, ['tools/storage-resilience.mjs'], {
        cwd: ROOT,
        encoding: 'utf8',
        env,
        timeout: 300000
    });
    const lines = (p.stdout || '').trim().split('\n');
    console.log(lines.slice(-16).join('\n'));
    console.log('退出码:', p.status);
    return p.status;
}

console.log('='.repeat(62));
console.log('步骤1：确认修复版本测试通过（基线）');
console.log('='.repeat(62));
snapshotFixed();
const baseRc = runTest('RUN_storage_resilience.log');
if (baseRc !== 0) {
    console.log('\n!! 基线未通过，反向验证无意义。');
    process.exit(2);
}

console.log();
console.log('='.repeat(62));
console.log('步骤2：临时回退修复，重跑同一测试（预期失败）');
console.log('='.repeat(62));
let negRc;
try {
    revertFix();
    negRc = runTest('RUN_negative.log');
} finally {
    console.log();
    console.log('='.repeat(62));
    console.log('步骤3：无条件还原修复版本');
    console.log('='.repeat(62));
    restoreFixed();
}

console.log();
console.log('='.repeat(62));
console.log('反向验证结论');
console.log('='.repeat(62));
console.log('修复版本退出码 :', baseRc, '(预期 0)');
console.log('回退版本退出码 :', negRc, '(预期非 0)');
const ok = baseRc === 0 && negRc !== 0;
console.log('结果           :', ok ? '通过——测试对缺陷有区分力' : '不通过——测试无区分力');
process.exit(ok ? 0 : 1);
