// /src/modules/theme.js
import { CONFIG } from './config.js';
import { state, normalizeThemeName } from './state.js';
import { createPopupMenu } from '../components/popupMenu.js';

const THEME_ATTR = 'data-theme';
const ITEM_ACTIVE_CLASS = 'active';

/**
 * 主题模块 —— `appTheme` 的**唯一写入者**。
 *
 * 职责边界（与 CM-006 countdown / CM-010 password 同构）：
 * - 只有这里写 `localStorage.appTheme` 与 `state.appTheme`
 * - 只有这里写 `<html data-theme>`
 * - 只有这里判定哪个 ⋯ 菜单项是当前主题（菜单的开合本身由 popupMenu 组件负责）
 * - 其他模块只读 `state.appTheme` 或用它派生样式
 *
 * 视觉层面：主题名只是 `<html>` 上的一个属性，真正的令牌覆盖由 CSS 的
 * `[data-theme="xxx"]` 选择器承载。本模块不碰具体配色，
 * 因此新增主题只需要：config.themes 加名字 + CSS 加一组令牌 + html 加一个菜单项。
 *
 * ⋯ 菜单的开合是通用交互（语言下拉用的是同一套），已抽到
 * `components/popupMenu.js`；本模块只通过 `onSelect` / `onSync` 注入主题语义。
 */
export const theme = {
    /**
     * ⋯ 菜单的组件实例。历史页没有这些节点 → 保持 null，菜单相关调用全部退化为空操作。
     */
    menu: null,

    /**
     * 初始化：同步主题到 DOM，并接上 ⋯ 菜单。
     *
     * 两个页面都调用本方法：
     * - index.html 有 #moreToggle / #morePanel / #moreBackdrop → 绑定菜单
     * - history.html 没有这些节点 → 只做 apply()，菜单相关全部跳过
     */
    init() {
        this.apply(state.appTheme);
        this.bindMenu();
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
     * 切换主题：校验 → 持久化 → 更新 state → 应用到 DOM → 同步菜单勾选。
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
        this.syncMenu();
        return next;
    },

    /**
     * 当前主题名。
     *
     * @returns {string} 合法主题名
     */
    getTheme() {
        return state.appTheme;
    },

    /**
     * 接上 ⋯ 菜单（开合交给 popupMenu 组件）。
     *
     * 菜单项一律用 `data-theme-name` 声明目标主题；组件在**捕获阶段**派发点击，
     * 因此 `#editButtons` 这类会 `stopPropagation()` 的菜单项也能被正确关闭。
     */
    bindMenu() {
        const toggle = document.getElementById('moreToggle');
        const panel = document.getElementById('morePanel');
        const backdrop = document.getElementById('moreBackdrop');

        // 没有 ⋯ 菜单的页面（history.html）：直接跳过，不注册任何监听
        if (!toggle || !panel) return;

        this.menu = createPopupMenu({
            toggle,
            panel,
            backdrop,
            itemSelector: '.more-item, [data-theme-name]',
            onSelect: (target) => {
                // 只有主题项需要本模块处理；编辑资料 / 编辑按钮由各自模块接管，
                // 这里什么都不做 —— 组件的默认行为就是"选完即关菜单"。
                const themeItem = target.closest('[data-theme-name]');
                if (!themeItem) return;
                this.setTheme(themeItem.dataset.themeName);
            },
            onSync: () => this.syncMenu()
        });

        // 行为组件：节点已在 html 里，render() 只负责挂载（不传容器，不做插入）
        this.menu.render();
        this.syncMenu();
    },

    /**
     * 把当前主题勾到对应菜单项上。
     *
     * 勾选状态只由 `state.appTheme` 推导，不额外存一份 UI 状态 ——
     * setTheme 与 init 都会调它，两条路径结果一致。
     */
    syncMenu() {
        const panel = this.menu?.panelEl;
        if (!panel) return;

        panel.querySelectorAll('[data-theme-name]').forEach((el) => {
            el.classList.toggle(ITEM_ACTIVE_CLASS, el.dataset.themeName === state.appTheme);
        });
    }
};
