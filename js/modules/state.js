// /src/modules/state.js
import { CONFIG } from './config.js';

export const state = {
    userProfile: null,
    canClick: true,
    isRequestPending: false,
    currentLang: 'zh',
    
    init() {
        // 从localStorage加载用户资料
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
            this.userProfile = JSON.parse(savedProfile);
        }
        
// 从localStorage加载语言设置（使用新的键名）
        const savedLang = localStorage.getItem('appLanguage');
        if (savedLang) {
            this.currentLang = savedLang;
        } else {
            // 浏览器语言检测
            const browserLang = navigator.language.split('-')[0];
            const supportedLangs = ['zh', 'en', 'ja', 'ko'];
            this.currentLang = supportedLangs.includes(browserLang) ? browserLang : 'zh';
        }
        
        // 检查冷却时间状态
        this.checkCooldownStatus();
        
        console.log("State initialized:", {
            userProfile: this.userProfile,
            canClick: this.canClick,
            currentLang: this.currentLang
        });
    },
    
    checkCooldownStatus() {
        const lastClickTime = localStorage.getItem('lastClickTime');
        if (lastClickTime) {
            const elapsedTime = Math.floor((Date.now() - parseInt(lastClickTime)) / 1000);
            const remainingTime = CONFIG.cooldownTime - elapsedTime;
            
            if (remainingTime > 0) {
                this.canClick = false;
                console.log("Cooldown active, remaining:", remainingTime, "seconds");
                
                // 如果需要自动恢复，可以设置定时器
                setTimeout(() => {
                    this.canClick = true;
                    console.log("Cooldown finished after refresh");
                }, remainingTime * 1000);
            } else {
                this.canClick = true;
                localStorage.removeItem('lastClickTime');
            }
        }
    }
};

// 立即初始化
state.init();