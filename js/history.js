// history.js

import {
    TRANSLATIONS
} from './translations.js';

document.addEventListener('DOMContentLoaded', function() {
    const historyList = document.getElementById('historyList');
    const backBtn = document.getElementById('historyBack');
    const historyData = JSON.parse(localStorage.getItem('notificationHistory')) || [];

    backBtn.addEventListener('click', () => window.history.back());

    function renderHistory() {
        if (historyData.length === 0) {
            historyList.innerHTML = '<div class="empty-state">暂无历史记录</div>';
            return;
        }

        historyList.innerHTML = historyData.map(item => `
            <div class="history-item ${item._status || ''}">
                <div class="history-emoji">${item.emoji}</div>
                <div class="history-content">
                    <div class="history-header">
                        <span class="history-name">${item.nickname}</span>
                        <span class="history-time">${formatRelativeTime(item.timestamp)}</span>
                    </div>
                    <div class="history-message">${item.message}</div>
                </div>
            </div>
        `).join('');
    }

    // 新增：相对时间格式化函数
    function formatRelativeTime(isoString, lang = 'zh') {
        const t = TRANSLATIONS[lang].time;
        const now = new Date();
        const date = new Date(isoString);
        const diffInSeconds = Math.floor((now - date) / 1000);

        const days = Math.floor(diffInSeconds / 86400);
        const hours = Math.floor((diffInSeconds % 86400) / 3600);
        const minutes = Math.floor((diffInSeconds % 3600) / 60);

        if (days > 0) {
            return hours > 0 ?
                t.daysHoursAgo.replace('{days}', days).replace('{hours}', hours) :
                t.daysAgo.replace('{days}', days);
        }
        if (hours > 0) {
            return t.hoursMinutesAgo
                .replace('{hours}', hours)
                .replace('{minutes}', minutes);
        }
        if (minutes > 0) {
            return t.minutesAgo.replace('{minutes}', minutes);
        }
        return t.justNow;
    }

    renderHistory();
});