// /src/modules/homeHistory.js
import { history } from './history.js';

/**
 * 首页内嵌的历史视图 —— 首页底部的「查看通知历史」入口不再跳转到
 * `history.html`，而是在同一页内切换视图（URL 不变）。
 *
 * 职责边界：
 * - 只负责**两个视图的切换**和「打开时重绘一次」；
 * - 记录怎么渲染、怎么安全落 DOM、怎么清空，全部复用 `history` 模块，
 *   不在这里复制第二份（两页结构保持一致，安全性也只有一处要审）；
 * - 视图文案走 index.html 的 `data-i18n`，由 language 统一填充，本模块不碰文案。
 */
export const homeHistory = {
    elements: null,

    /**
     * 绑定首页内嵌历史视图。
     *
     * 节点全部在 index.html 预埋（DOM 契约：主题与视图只用显隐切换，
     * 不在运行时创建节点）。缺任何一个关键节点就整体跳过，
     * 首页退化为「没有历史入口」，不影响其他功能。
     *
     * @param {Object} dom { entry, homeView, view, list, back, clear }
     * @returns {boolean} 是否成功绑定
     */
    init(dom) {
        const required = ['entry', 'homeView', 'view', 'list'];
        if (!dom || required.some((k) => !dom[k])) {
            console.warn('[homeHistory] 首页历史视图节点缺失，跳过绑定');
            return false;
        }

        this.elements = dom;
        this.bindEvents();
        return true;
    },

    // 绑定事件
    bindEvents() {
        this.elements.entry.addEventListener('click', () => this.open());
        this.elements.back?.addEventListener('click', () => this.close());

        if (this.elements.clear) {
            this.elements.clear.addEventListener('click', () => {
                history.clear(this.elements.list);
            });
        }
    },

    /**
     * 切到历史视图：先重绘（保证是最新的记录），再切换显隐。
     *
     * 用 `hidden` 属性而不是 CSS 类 —— 语义化、且天然对辅助技术生效。
     */
    open() {
        if (!this.elements) return;

        history.renderList(this.elements.list);
        this.elements.homeView.hidden = true;
        this.elements.view.hidden = false;
    },

    /**
     * 切回首页主视图。
     */
    close() {
        if (!this.elements) return;

        this.elements.view.hidden = true;
        this.elements.homeView.hidden = false;
    }
};
