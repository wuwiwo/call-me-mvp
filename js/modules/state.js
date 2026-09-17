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

export const state = {
    userProfile: null,
    canClick: true,
    isRequestPending: false,
    currentLang: 'zh',
    
    init() {
        // 从localStorage加载用户资料
        // 损坏或类型错误时回退为 null（未注册），不阻断启动
        this.userProfile = readJsonSafe(
            'userProfile',
            null,
            v => v !== null && typeof v === 'object' && !Array.isArray(v)
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
        
        // 检查冷却时间状态
        this.checkCooldownStatus();
        
    },
    
    checkCooldownStatus() {
        const lastClickTime = localStorage.getItem('lastClickTime');
        if (lastClickTime) {
            const parsed = parseInt(lastClickTime);
            // 非数字时间戳视为无冷却，并清理该 key（保留原有清理语义）
            if (!Number.isFinite(parsed)) {
                localStorage.removeItem('lastClickTime');
                this.canClick = true;
                return;
            }

            const elapsedTime = Math.floor((Date.now() - parsed) / 1000);
            const remainingTime = CONFIG.cooldownTime - elapsedTime;
            
            if (remainingTime > 0) {
                this.canClick = false;
                
                // 如果需要自动恢复，可以设置定时器
                setTimeout(() => {
                    this.canClick = true;
                }, remainingTime * 1000);
            } else {
                this.canClick = true;
                localStorage.removeItem('lastClickTime');
            }
        }
    }
};

// 立即初始化
state.init();