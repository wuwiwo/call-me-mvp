// history.js - 修改后的完整代码
// /src/modules/history.js
import { utils } from './utils.js';
import { state } from './state.js';

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
    render() {
        const records = JSON.parse(localStorage.getItem('notificationHistory')) || [];
        
        if (records.length === 0) {
            this.elements.list.innerHTML = `
                <div class="empty-state">
                    ${utils.getTranslation("history.empty")}
                </div>
            `;
            return;
        }
        
        this.elements.list.innerHTML = records.map(record => `
            <div class="history-item ${record._status}">
                <div class="history-emoji">${record.emoji}</div>
                <div class="history-content">
                    <div class="history-header">
                        <span class="history-name">${record.nickname}</span>
                        <span class="history-time">${utils.formatTime(record.timestamp)}</span>
                    </div>
                    <div class="history-message">${record.message}</div>
                    ${record._status === 'error' ? `
                        <div class="history-error">Webhook: ${record.webhook}</div>
                    ` : ''}
                </div>
            </div>
        `).join('');
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