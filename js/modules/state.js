// /src/modules/state.js
import { CONFIG } from './config.js';

/**
 * 安全读取并解析 LocalStorage 中的 JSON。
 *
 * LocalStorage 内容可能被用户手工修改、被浏览器扩展写入，或因写入中断而损坏。
 * 直接 JSON.parse 会在模块导入阶段抛出，导致整个页面无法初始化。
 *
 * 回退规则（不抛异常，不静默改写可解析的数据）：
 * - key 不存在 / 空字符串 → 返回 fallback
 * - JSON 非法 → 返回 fallback（原始值保留在 storage 中，不删除）
 * - 解析成功但类型不符合 expectation → 返回 fallback
 *
 * @param {string} key LocalStorage key
 * @param {*} fallback 无法使用时返回的值
 * @param {(v: *) => boolean} [isValid] 额外的顶层类型校验
 * @returns {*} 解析结果或 fallback
 */
export function readJsonSafe(key, fallback, isValid) {
    let raw;
    try {
        raw = localStorage.getItem(key);
    } catch (e) {
        // 隐私模式等场景下 storage 可能不可访问
        console.warn(`[storage] 无法读取 ${key}:`, e);
        return fallback;
    }

    if (raw === null || raw === '') return fallback;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        // 不删除原始值，保留供用户排查；仅降级本次读取
        console.warn(`[storage] ${key} 不是合法 JSON，已回退默认值:`, e);
        return fallback;
    }

    if (isValid && !isValid(parsed)) {
        console.warn(`[storage] ${key} 顶层类型不符合预期，已回退默认值`);
        return fallback;
    }

    return parsed;
}

/**
 * 把任意值归一化成合法主题名（fail-safe）。
 *
 * 非法、缺失、类型不对一律回退默认主题，不抛异常。
 * 合法性的唯一来源是 `CONFIG.themes.valid` / `CONFIG.themes.default`。
 *
 * @param {*} value 候选主题名
 * @returns {string} 合法主题名
 */
export function normalizeThemeName(value) {
    return CONFIG.themes.valid.includes(value) ? value : CONFIG.themes.default;
}

/**
 * 读取持久化的主题名。
 *
 * 存储格式是**纯字符串**（与 appLanguage / buttonDisplayMode 一致），
 * 但历史上也可能被写成 JSON 字符串（`"list"`），两种都接受：
 * 先按纯字符串判定，失败再走 readJsonSafe —— 损坏的 JSON 由它安全回退。
 *
 * @returns {string} 合法主题名
 */
function readThemeName() {
    const key = CONFIG.themes.storageKey;
    let raw;
    try {
        raw = localStorage.getItem(key);
    } catch (e) {
        console.warn(`[theme] 无法读取 ${key}:`, e);
        return CONFIG.themes.default;
    }

    if (CONFIG.themes.valid.includes(raw)) return raw;

    // 不是合法纯字符串 → 尝试 JSON 形式；非法 JSON 在 readJsonSafe 内降级
    const parsed = readJsonSafe(key, null, (v) => typeof v === 'string');
    return normalizeThemeName(parsed);
}

export const state = {
    userProfile: null,

    // 点击闸门。**冷却期间由 countdown（cooldown 唯一责任者）写入**，
    // 其他模块只读，不再自行改写（CM-006）。
    canClick: true,

    isRequestPending: false,
    currentLang: 'zh',

    // 当前主题名。**由 theme 模块独占写入**（读取在 init 里完成一次），
    // 其他模块只读，不自行解析 appTheme（CM-010 单一来源教训）。
    appTheme: CONFIG.themes.default,

    init() {
        // 从localStorage加载用户资料
        // 损坏或类型错误时回退为 null（未注册），不阻断启动
        this.userProfile = readJsonSafe(
            'userProfile',
            null,
            (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
        );

        // 从localStorage加载语言设置（使用新的键名）
        const savedLang = localStorage.getItem('appLanguage');
        if (savedLang) {
            this.currentLang = savedLang;
        } else {
            // 浏览器语言检测
            const browserLang = navigator.language.split('-')[0];
            const supportedLangs = ['zh', 'en', 'ja', 'ko'];
            this.currentLang = supportedLangs.includes(browserLang) ? browserLang : 'zh';
        }

        // 从localStorage加载主题设置，非法/损坏值回退默认主题
        this.appTheme = readThemeName();

        // 冷却状态的恢复不再在这里进行：
        // 它需要倒计时显示元素，而本模块在导入期就会执行，
        // 早于 DOM 就绪与 countdown.init()。
        // 现在统一由 countdown.restore() 在 countdown.init() 之后处理（CM-006）。
    }
};

// 立即初始化
state.init();
