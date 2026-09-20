// /src/modules/theme.js
import { CONFIG } from './config.js';
import { state, normalizeThemeName } from './state.js';

const THEME_ATTR = 'data-theme';

/**
 * 主题模块 —— `appTheme` 的**唯一写入者**。
 *
 * 职责边界（与 CM-006 countdown / CM-010 password 同构）：
 * - 只有这里写 `localStorage.appTheme` 与 `state.appTheme`
 * - 只有这里写 `<html data-theme>`（S2 阶段）
 * - 其他模块只读 `state.appTheme` 或用它派生样式
 *
 * 视觉层面：主题名只是 `<html>` 上的一个属性，真正的令牌覆盖由 CSS 的
 * `[data-theme="xxx"]` 选择器承载（S3 填充）。本模块不碰具体配色，
 * 因此新增主题不需要改 JS。
 */
export const theme = {
    /**
     * 初始化：把已归一化的主题名落到 DOM。
     *
     * 主题名本身在 `state.init()` 里就完成了读取与校验（模块导入期执行），
     * 这里只负责同步到 `<html data-theme>`，不重复解析 storage。
     */
    init() {
        this.apply(state.appTheme);
    },

    /**
     * 把主题名写到 `<html data-theme>`。
     *
     * @param {string} name 已归一化的主题名
     */
    apply(name) {
        try {
            document.documentElement.setAttribute(THEME_ATTR, name);
        } catch (e) {
            console.warn('[theme] 无法写入 data-theme:', e);
        }
    },

    /**
     * 切换主题：校验 → 持久化 → 更新 state → 应用到 DOM。
     *
     * 非法入参不会抛异常，一律回退默认主题（fail-safe）。
     *
     * @param {*} name 目标主题名
     * @returns {string} 实际生效的主题名
     */
    setTheme(name) {
        const next = normalizeThemeName(name);

        try {
            localStorage.setItem(CONFIG.themes.storageKey, next);
        } catch (e) {
            // 隐私模式/配额不足：不影响本次会话内的切换，只是不持久化
            console.warn('[theme] 无法持久化主题:', e);
        }

        state.appTheme = next;
        this.apply(next);
        return next;
    },

    /**
     * 当前主题名。
     *
     * @returns {string} 合法主题名
     */
    getTheme() {
        return state.appTheme;
    }
};
