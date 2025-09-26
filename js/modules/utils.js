// /src/modules/utils.js
import { TRANSLATIONS } from './translations.js';
import { state } from './state.js';

// 工具函数集合
export const utils = {
    // 获取翻译文本
   
getTranslation(keyPath) {
    const keys = keyPath.split(".");
    let result = keys.reduce((obj, key) => {
        return obj && obj[key];
    }, TRANSLATIONS[state.currentLang]);
    
    // 如果找不到翻译，尝试使用中文作为备用，或者返回keyPath
    if (result === undefined) {
        console.warn("Translation not found for:", keyPath, "in language:", state.currentLang);
        
        // 尝试使用中文作为备用
        if (state.currentLang !== 'zh') {
            result = keys.reduce((obj, key) => {
                return obj && obj[key];
            }, TRANSLATIONS.zh);
        }
        
        // 如果还是找不到，返回keyPath
        if (result === undefined) {
            return keyPath;
        }
    }
    
    return result;
},
    
    formatString(template, data) {
        if (!template || typeof template !== 'string') {
            console.error("Invalid template:", template);
            return template || '';
        }
        
        return template.replace(/{(\w+)}/g, (match, key) => {
            return data[key] !== undefined ? data[key] : match;
        });
    },
    
    
    // 显示/隐藏元素
    showElement(el, show = true) {
        el.classList.toggle("hidden", !show);
    },

    // 时间格式化
    formatTime(timestamp) {
        const date = new Date(timestamp);
        return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} 
                ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    },

    // 相对时间格式化
    formatRelativeTime(isoString) {
        const t = TRANSLATIONS[state.currentLang].time;
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
};