// /src/components/popupMenu.js
//
// 弹出菜单组件（toggle + panel + 可选遮罩）。
//
// 抽它的直接原因：首页有两个结构相同、实现各写一遍的弹出菜单 ——
//   - 顶栏的语言下拉（`#languageToggle` / `#languageMenu`）
//   - 顶栏的 ⋯ 更多菜单（`#moreToggle` / `#morePanel` / `#moreBackdrop`）
// 两者都是「点 toggle 开合 / 点选项执行并关闭 / 点页面别处关闭 / 给 toggle 加 active」，
// 但遮罩一个运行时创建、一个预埋在 html，于是连关闭逻辑都写了两份。
// 组件用配置项表达这两种既有形态，**不统一它们的 DOM 形态** —— 因为
// 各自的 class 与节点已被样式和测试钉住，强行统一等于改产品行为。
//
// 组件只管开合与事件，不知道选项代表什么：选中做什么由 `onSelect` 决定，
// 「哪一项是当前项」由 `onSync` 决定。因此它不持有业务状态。
//
// 命名：节点属性带 `El` 后缀（`toggleEl` / `panelEl`），把 `open/close/toggle`
// 这三个动词留给组件的开合方法，避免同名冲突。
import { defineComponent } from './component.js';

const OPEN_CLASS = 'show';
const ACTIVE_CLASS = 'active';

/**
 * 创建弹出菜单组件。
 *
 * @param {Object} options
 * @param {HTMLElement} options.toggle 触发按钮
 * @param {HTMLElement} options.panel 菜单面板
 * @param {HTMLElement} [options.backdrop] 预埋遮罩节点（加/去 `show` 显隐）
 * @param {Object} [options.createBackdrop] 运行时创建遮罩：`{ id, className }`。
 *        与 `backdrop` 二选一 —— 两种形态对应两套既有 DOM 契约，不能强行统一。
 * @param {string} [options.itemSelector] 命中该选择器的点击才算"选了菜单项"。
 *        不传则点击面板内任何元素都视为选中。
 * @param {Function} [options.onSelect] `(target, event) => void|false`；
 *        返回 `false` 表示处理了但**不关闭**菜单。
 * @param {Function} [options.onSync] `() => void`；开合与 update 时调用，
 *        用来把外部状态（当前语言 / 当前主题）映射成菜单里的选中态。
 * @returns {Object} 组件实例
 */
export function createPopupMenu(options = {}) {
    const {
        toggle,
        panel,
        backdrop = null,
        createBackdrop = null,
        itemSelector = '',
        onSelect = null,
        onSync = null
    } = options;

    return defineComponent({
        el: panel,
        toggleEl: toggle,
        panelEl: panel,
        backdrop,
        createBackdropSpec: createBackdrop,
        itemSelector,
        onSelect,
        onSync,
        openClass: OPEN_CLASS,

        /**
         * 绑定事件。
         *
         * 面板监听刻意放在**捕获阶段**：菜单项自己的监听会 `stopPropagation()`
         * （buttonManager 对 `#editButtons` 就是这么干的），冒泡阶段的面板监听
         * 收不到事件，于是"点了菜单项但菜单不关"。捕获阶段不受影响。
         */
        mount() {
            if (!this.toggleEl || !this.panelEl) return;

            this.handleToggleClick = (event) => {
                event.stopPropagation();
                this.toggle();
            };
            this.toggleEl.addEventListener('click', this.handleToggleClick);

            this.handlePanelClick = (event) => {
                const target = event.target instanceof Element ? event.target : null;
                if (!target) return;

                // 只处理"选中"语义的点击；点面板空白处不关菜单（保持既有行为）
                if (this.itemSelector && !target.closest(this.itemSelector)) return;

                if (typeof this.onSelect === 'function' && this.onSelect(target, event) === false) {
                    return;
                }
                this.close();
            };
            this.panelEl.addEventListener('click', this.handlePanelClick, true);

            // 点页面别处关闭
            this.handleDocumentClick = () => this.close();
            document.addEventListener('click', this.handleDocumentClick);

            if (this.backdrop) {
                this.handleBackdropClick = () => this.close();
                this.backdrop.addEventListener('click', this.handleBackdropClick);
            }
        },

        unmount() {
            if (this.toggleEl && this.handleToggleClick) {
                this.toggleEl.removeEventListener('click', this.handleToggleClick);
            }
            if (this.panelEl && this.handlePanelClick) {
                this.panelEl.removeEventListener('click', this.handlePanelClick, true);
            }
            if (this.handleDocumentClick) {
                document.removeEventListener('click', this.handleDocumentClick);
            }
            if (this.backdrop && this.handleBackdropClick) {
                this.backdrop.removeEventListener('click', this.handleBackdropClick);
            }
            this.mounted = false;
        },

        /** 用新 props 刷新（行为组件没有内部视图状态，主要是触发一次 onSync） */
        update() {
            this.sync();
        },

        /** 让外部状态决定菜单里哪一项是"当前项" */
        sync() {
            if (typeof this.onSync === 'function') this.onSync(this);
        },

        open() {
            if (!this.panelEl) return;
            this.panelEl.classList.add(this.openClass);
            this.toggleEl?.classList.add(ACTIVE_CLASS);
            this.applyBackdrop(true);
            this.sync();
        },

        close() {
            if (!this.panelEl) return;
            this.panelEl.classList.remove(this.openClass);
            this.toggleEl?.classList.remove(ACTIVE_CLASS);
            this.applyBackdrop(false);
        },

        /** 开合：已展开则关闭，否则打开 */
        toggle() {
            if (this.isOpen()) {
                this.close();
            } else {
                this.open();
            }
        },

        /** @returns {boolean} 面板是否处于展开态 */
        isOpen() {
            return !!this.panelEl && this.panelEl.classList.contains(this.openClass);
        },

        applyBackdrop(open) {
            if (this.backdrop) {
                this.backdrop.classList.toggle(this.openClass, open);
                return;
            }

            const spec = this.createBackdropSpec;
            if (!spec) return;

            if (open) {
                if (document.getElementById(spec.id)) return;
                const backdrop = document.createElement('div');
                backdrop.id = spec.id;
                backdrop.className = spec.className;
                backdrop.addEventListener('click', () => this.close());
                document.body.appendChild(backdrop);
            } else {
                document.getElementById(spec.id)?.remove();
            }
        }
    });
}
