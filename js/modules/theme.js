// /src/modules/theme.js
import { CONFIG } from './config.js';
import { state, normalizeThemeName } from './state.js';

const THEME_ATTR = 'data-theme';
const PANEL_OPEN_CLASS = 'show';
const TOGGLE_ACTIVE_CLASS = 'active';
const ITEM_ACTIVE_CLASS = 'active';

/**
 * 主题模块 —— `appTheme` 的**唯一写入者**，以及 ⋯ 菜单的唯一所有者。
 *
 * 职责边界（与 CM-006 countdown / CM-010 password 同构）：
 * - 只有这里写 `localStorage.appTheme` 与 `state.appTheme`
 * - 只有这里写 `<html data-theme>`
 * - 只有这里开合 ⋯ 菜单、判定哪个菜单项是当前主题
 * - 其他模块只读 `state.appTheme` 或用它派生样式
 *
 * 视觉层面：主题名只是 `<html>` 上的一个属性，真正的令牌覆盖由 CSS 的
 * `[data-theme="xxx"]` 选择器承载。本模块不碰具体配色，
 * 因此新增主题只需要：config.themes 加名字 + CSS 加一组令牌 + html 加一个菜单项。
 */
export const theme = {
    /**
     * ⋯ 菜单的三个节点。历史页没有这些节点 → 保持 null，所有菜单方法自动退化为空操作。
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
        this.syncMenu();
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
     * 绑定 ⋯ 菜单事件。
     *
     * 菜单项一律用 `data-theme-name` 声明目标主题，事件**委托在面板上**：
     * buttonManager 会用 `replaceWith(cloneNode)` 重建 #editButtons，
     * 委托能保证重建后菜单行为不丢。
     */
    bindMenu() {
        const toggle = document.getElementById('moreToggle');
        const panel = document.getElementById('morePanel');
        const backdrop = document.getElementById('moreBackdrop');

        // 没有 ⋯ 菜单的页面（history.html）：直接跳过，不注册任何监听
        if (!toggle || !panel) return;

        this.menu = { toggle, panel, backdrop };

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // 捕获阶段处理：#editButtons / #editProfile 自己的监听会 stopPropagation
        // （buttonManager 就是这么干的），冒泡阶段的面板监听收不到 ——
        // 放在捕获阶段才能保证点菜单项后菜单一定关闭。
        panel.addEventListener(
            'click',
            (e) => {
                const themeItem = e.target.closest('[data-theme-name]');
                if (themeItem) {
                    this.setTheme(themeItem.dataset.themeName);
                    this.closeMenu();
                    return;
                }
                // 编辑资料 / 编辑按钮：关掉菜单，按钮自身的监听照常执行
                if (e.target.closest('.more-item')) {
                    this.closeMenu();
                }
            },
            true
        );

        // 点遮罩关闭
        backdrop?.addEventListener('click', () => this.closeMenu());

        // 点页面其他位置也关闭
        document.addEventListener('click', () => this.closeMenu());
    },

    /**
     * 开合 ⋯ 菜单（面板在顶栏下方展开，不是底部动作面板）。
     */
    toggleMenu() {
        if (!this.menu) return;

        if (this.menu.panel.classList.contains(PANEL_OPEN_CLASS)) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    },

    /**
     * 打开 ⋯ 菜单。
     */
    openMenu() {
        if (!this.menu) return;

        this.menu.panel.classList.add(PANEL_OPEN_CLASS);
        this.menu.toggle.classList.add(TOGGLE_ACTIVE_CLASS);
        this.menu.backdrop?.classList.add(PANEL_OPEN_CLASS);
        this.syncMenu();
    },

    /**
     * 关闭 ⋯ 菜单。
     */
    closeMenu() {
        if (!this.menu) return;

        this.menu.panel.classList.remove(PANEL_OPEN_CLASS);
        this.menu.toggle.classList.remove(TOGGLE_ACTIVE_CLASS);
        this.menu.backdrop?.classList.remove(PANEL_OPEN_CLASS);
    },

    /**
     * 把当前主题勾到对应菜单项上。
     *
     * 勾选状态只由 `state.appTheme` 推导，不额外存一份 UI 状态 ——
     * setTheme 与 init 都会调它，两条路径结果一致。
     */
    syncMenu() {
        const panel = this.menu?.panel;
        if (!panel) return;

        panel.querySelectorAll('[data-theme-name]').forEach((el) => {
            el.classList.toggle(ITEM_ACTIVE_CLASS, el.dataset.themeName === state.appTheme);
        });
    }
};
