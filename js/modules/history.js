// history.js - 修改后的完整代码
// /src/modules/history.js
import { utils } from './utils.js';
import { readJsonSafe } from './state.js';

// 历史记录只允许两种既有状态。
// `_status` 来自 LocalStorage，属于可控输入：未知或缺失一律不产生状态 class，
// 以免任意字符串经由模板字符串突破 class 属性。
const HISTORY_STATUSES = new Set(['success', 'error']);

// 安全的历史状态取值：非法值返回空串（不产生状态 class）。
function safeStatus(status) {
    return HISTORY_STATUSES.has(status) ? status : '';
}

// 历史记录管理
export const history = {
    // DOM元素
    elements: null,
    
    // 初始化
    init(domElements) {
        // 检查是否提供了必要的DOM元素
        if (!domElements.list || !domElements.backBtn || !domElements.clearBtn) {
            console.error('历史记录模块初始化失败：缺少必要的DOM元素');
            return false;
        }
        
        this.elements = domElements;
        this.bindEvents();
        this.render();
        return true;
    },
    
    // 绑定事件
    bindEvents() {
        this.elements.clearBtn.addEventListener('click', () => this.clear());
        this.elements.backBtn.addEventListener('click', () => window.history.back());
    },
    
    // 渲染历史记录
    //
    // 记录内容（nickname / emoji / message / webhook）与 `_status` 都来自
    // LocalStorage，属于可控输入，必须作为**文本**进入页面：
    // 全部用 createElement + textContent 构建 DOM，不用模板字符串拼 HTML。
    // 这样恶意字符串 `<img onerror=...>` 只会显示成字面文本，
    // 不会产生新元素、新属性，也不会执行脚本。
    render() {
        // 损坏或类型错误时回退为空数组，历史页仍可加载并显示空状态
        const records = readJsonSafe(
            'notificationHistory',
            [],
            v => Array.isArray(v)
        );

        const list = this.elements.list;
        list.textContent = '';

        if (records.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = utils.getTranslation('history.empty');
            list.appendChild(empty);
            return;
        }

        records.forEach(record => {
            const item = record && typeof record === 'object' ? record : {};
            const status = safeStatus(item._status);

            const itemEl = document.createElement('div');
            itemEl.className = status
                ? `history-item ${status}`
                : 'history-item';

            const emojiEl = document.createElement('div');
            emojiEl.className = 'history-emoji';
            emojiEl.textContent = item.emoji ?? '';

            const contentEl = document.createElement('div');
            contentEl.className = 'history-content';

            const headerEl = document.createElement('div');
            headerEl.className = 'history-header';

            const nameEl = document.createElement('span');
            nameEl.className = 'history-name';
            nameEl.textContent = item.nickname ?? '';

            const timeEl = document.createElement('span');
            timeEl.className = 'history-time';
            timeEl.textContent = utils.formatTime(item.timestamp);

            headerEl.appendChild(nameEl);
            headerEl.appendChild(timeEl);

            const messageEl = document.createElement('div');
            messageEl.className = 'history-message';
            messageEl.textContent = item.message ?? '';

            contentEl.appendChild(headerEl);
            contentEl.appendChild(messageEl);

            if (status === 'error') {
                const errorEl = document.createElement('div');
                errorEl.className = 'history-error';
                errorEl.textContent = `Webhook: ${item.webhook ?? ''}`;
                contentEl.appendChild(errorEl);
            }

            itemEl.appendChild(emojiEl);
            itemEl.appendChild(contentEl);
            list.appendChild(itemEl);
        });
    },
    
    // 清除历史记录
    clear() {
        localStorage.removeItem('notificationHistory');
        this.render();
        
        // 显示清除成功的反馈
        const toast = document.createElement('div');
        toast.className = 'history-toast';
        toast.textContent = '历史记录已清除';
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
};