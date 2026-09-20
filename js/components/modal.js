// /src/components/modal.js
//
// 模态框组件。
//
// 抽它的直接原因：项目里有四处各写一遍的模态框开关逻辑 ——
// 资料模态框、按钮编辑模态框、访问提示模态框、确认对话框。
// 它们的关法并不一致（有的点遮罩可关、有的强制不可关），所以差异用
// 配置项 `dismissible` / `transient` 表达，而不是硬塞进一个"标准模态框"。
//
// 本组件管的是**开关与关闭来源**（关闭按钮 / 遮罩），不接管模态框内容 ——
// 内容仍由各自的业务模块填。这样"把已有模态框交给组件"是纯加法：
// DOM 结构、id、class 全都不动。
import { defineComponent } from './component.js';
import { utils } from '../modules/utils.js';

const OPEN_CLASS = 'show';

/**
 * 创建模态框组件（接管一个已存在的 `.modal` 节点）。
 *
 * @param {HTMLElement} el 模态框节点
 * @param {Object} [options]
 * @param {boolean} [options.dismissible=true] 点遮罩是否关闭。
 *        访问提示那类"必须做出选择"的模态框传 false。
 * @param {string} [options.closeSelector='.close-btn'] 关闭按钮选择器
 * @param {Function} [options.onOpen] 打开后回调
 * @param {Function} [options.onClose] 关闭后回调
 * @param {boolean} [options.transient=false] 关闭时是否把节点从 DOM 移除。
 *        运行时创建的模态框（确认对话框）用 true；预埋在 html 里的用 false。
 * @returns {Object} 组件实例
 */
export function createModal(el, options = {}) {
    const {
        dismissible = true,
        closeSelector = '.close-btn',
        onOpen = null,
        onClose = null,
        transient = false
    } = options;

    return defineComponent({
        el,
        dismissible,
        closeSelector,
        onOpen,
        onClose,
        transient,
        openClass: OPEN_CLASS,

        mount() {
            if (!this.el) return;

            this.handleClick = (event) => {
                if (!(event.target instanceof Element)) return;

                if (this.closeSelector && event.target.closest(this.closeSelector)) {
                    this.close();
                    return;
                }

                // 点遮罩（模态框自身的空白区）关闭
                if (this.dismissible && event.target === this.el) {
                    this.close();
                }
            };
            this.el.addEventListener('click', this.handleClick);
        },

        unmount() {
            if (this.el && this.handleClick) {
                this.el.removeEventListener('click', this.handleClick);
            }
            this.mounted = false;
        },

        /** props 目前只有开关状态之外的配置覆写，默认无副作用 */
        update() {},

        open() {
            if (!this.el) return;
            this.el.classList.add(this.openClass);
            if (typeof this.onOpen === 'function') this.onOpen(this);
        },

        close() {
            if (!this.el) return;
            this.el.classList.remove(this.openClass);
            if (typeof this.onClose === 'function') this.onClose(this);
            if (this.transient) {
                this.unmount();
                this.el.remove();
                this.el = null;
            }
        },

        toggle() {
            if (this.isOpen()) {
                this.close();
            } else {
                this.open();
            }
        },

        /** @returns {boolean} 是否处于打开态 */
        isOpen() {
            return !!this.el && this.el.classList.contains(this.openClass);
        }
    });
}

/**
 * 确认对话框（运行时创建，关闭即销毁）。
 *
 * 取代原先散落在业务模块里的 `showConfirmDialog`。DOM 结构与 class 保持原样
 * （`.confirm-modal` / `.confirm-message` / `.confirm-cancel-btn` / `.confirm-ok-btn`），
 * 因此样式与既有测试都不受影响。
 *
 * `message` 是调用方传入的提示文本，属动态内容，用 textContent 写入；
 * 模板里剩下的插值全是应用自带的多语言文案，不随用户输入变化。
 *
 * @param {Object} options
 * @param {string} options.message 提示消息
 * @param {Function} options.onConfirm 确认回调
 * @param {Function} [options.onCancel] 取消回调
 * @returns {Object} 组件实例
 */
function confirmDialog({ message, onConfirm, onCancel }) {
    const el = document.createElement('div');
    el.className = `modal ${OPEN_CLASS} confirm-modal`;
    el.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${utils.getTranslation('common.confirm')}</h2>
            </div>
            <div class="modal-body">
                <p class="confirm-message"></p>
            </div>
            <div class="modal-footer">
                <button class="btn confirm-cancel-btn">${utils.getTranslation('common.cancel')}</button>
                <button class="btn save-btn confirm-ok-btn">${utils.getTranslation('common.confirm')}</button>
            </div>
        </div>
    `;
    el.querySelector('.confirm-message').textContent = message ?? '';

    const dialog = createModal(el, { dismissible: true, transient: true });

    el.querySelector('.confirm-cancel-btn').addEventListener('click', () => {
        dialog.close();
        if (typeof onCancel === 'function') onCancel();
    });

    el.querySelector('.confirm-ok-btn').addEventListener('click', () => {
        dialog.close();
        if (typeof onConfirm === 'function') onConfirm();
    });

    // 先挂载再入 DOM，保证遮罩点击从第一帧起就生效
    dialog.render(document.body);
    return dialog;
}

/** 模态框组件集合：便于调用方一眼看到可用能力 */
export const modal = {
    create: createModal,
    confirm: confirmDialog
};
