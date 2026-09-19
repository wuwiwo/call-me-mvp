// /tools/chrome-path.mjs
//
// 回归套件共用的 Chrome 可执行文件解析（CM-009）。
//
// 背景：7 个套件原来各自内联同一句
//   const CHROME = process.env.CM00x_CHROME || "C:/Program Files/.../chrome.exe";
// 默认值是**本机 Windows 路径**，换机器（尤其 CI 的 ubuntu）就找不到 Chrome。
// 本模块把解析逻辑收敛到一处，套件只保留自己的 `<套件>_CHROME` 覆盖入口。
//
// 解析优先级（自上而下，取**第一个真实存在**的）：
//   1. `<套件>_CHROME`   —— 最具体，单次运行级覆盖
//   2. `CHROME_PATH`     —— 通用覆盖，本机 / CI 都可用
//   3. 当前平台的常见安装位置（Windows / macOS / Linux）
//   4. 其他平台的常见位置（兜底，避免跨平台误配时直接失败）
//   5. `google-chrome` / `chromium` 等可执行名（仅非 Windows；即 `which`）
//
// 刻意**不做**的事：
//   - 不抛异常。一个候选都找不到时返回首个候选并在 stderr 给出尝试清单 ——
//     让调用方（套件）照常打印自己的环境头，报错信息更可定位，
//     也避免"import 期就崩、什么都没打印"这种难以排查的失败。
//   - 不改变调用方的失败语义：找不到时最终仍由 spawn 报错，只是多了可读的诊断。
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Windows 上的常见安装位置（第一条是各套件原先的默认值，保持行为不变）。 */
function windowsCandidates() {
    const list = [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
    ];
    // 用户级安装（仅当前用户）也常见
    if (process.env.LOCALAPPDATA) {
        list.push(`${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`);
    }
    return list;
}

/** macOS 上的常见位置。 */
function macCandidates() {
    return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
}

/** Linux（含 CI runner）上的常见位置。 */
function linuxCandidates() {
    return [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/opt/google/chrome/chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
    ];
}

/**
 * 用可执行名探测（等价于 `which`）。仅非 Windows 执行 ——
 * Windows 上 `which` 未必存在，且常见位置已在上面的列表里覆盖。
 */
function probeByWhich() {
    if (process.platform === 'win32') return [];
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
    const found = [];
    for (const n of names) {
        try {
            const p = execFileSync('which', [n], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
            if (p) found.push(p);
        } catch {
            /* 该名字不存在，继续 */
        }
    }
    return found;
}

/**
 * 返回按优先级排列、已剔除空值的候选路径列表。
 * @param {string} [override] `<套件>_CHROME` 的值
 */
export function chromeCandidates(override) {
    const platform = process.platform;
    const primary =
        platform === 'win32'
            ? windowsCandidates()
            : platform === 'darwin'
              ? macCandidates()
              : linuxCandidates();
    const rest = [...windowsCandidates(), ...macCandidates(), ...linuxCandidates()];

    return [override, process.env.CHROME_PATH, ...primary, ...rest, ...probeByWhich()].filter(
        (v) => typeof v === 'string' && v.trim() !== ''
    );
}

/**
 * 解析出要用的 Chrome 可执行文件。
 *
 * 找不到任何真实存在的候选时**不抛异常**：打印尝试清单后回退到首个候选，
 * 由调用方的 spawn 报出最终错误。
 *
 * @param {string} [override] `<套件>_CHROME` 的值
 * @returns {string} 解析到的路径
 */
export function resolveChrome(override) {
    const tried = chromeCandidates(override);
    for (const p of tried) {
        try {
            if (existsSync(p)) return p;
        } catch {
            /* 路径非法（如含 NUL）时跳过 */
        }
    }

    console.error('[chrome-path] 找不到可用的 Chrome，已尝试：');
    for (const p of tried) console.error('  - ' + p);
    console.error('[chrome-path] 可用 CHROME_PATH=<路径> 或 <套件>_CHROME=<路径> 显式指定。');
    return tried[0];
}
