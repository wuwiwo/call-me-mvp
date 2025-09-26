// /src/modules/countdown.js
import { CONFIG } from './config.js';
import { utils } from './utils.js';
import { state } from './state.js';

export const countdown = {
    elements: null,
    timer: null,
    remainingTime: 0,

    init(elements) {
        this.elements = elements;
        console.log("Countdown module initialized");
    },

    // /src/modules/countdown.js
// /src/modules/countdown.js
start(initialTime = CONFIG.cooldownTime) {
    this.stop();
    this.remainingTime = initialTime;
    
    console.log("Starting countdown with:", this.remainingTime, "seconds");
    
    // 确保状态同步
    state.canClick = false;
    
    this.updateDisplay();
    this.elements.countdownEl.classList.add('active');
    
    this.timer = setInterval(() => {
        this.remainingTime--;
        this.updateDisplay();
        
        if (this.remainingTime <= 0) {
            this.stop();
            state.canClick = true;
            localStorage.removeItem('lastClickTime');
            console.log("Countdown finished, canClick set to true");
        }
    }, 1000);
},

stop() {
    if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
    }
    this.elements.countdownEl.classList.remove('active');
    
    // 倒计时结束时可以隐藏元素
    // if (this.remainingTime <= 0) {
        // this.elements.countdownEl.style.display = 'none';
        // this.elements.countdownEl.style.opacity = '0';
        // this.elements.countdownEl.style.height = '0';
    // }
    
    console.log("Countdown stopped");
},
    // /src/modules/countdown.js
updateDisplay() {
    if (!this.elements.countdownNameEl || !this.elements.countdownTextEl) {
        console.error("Countdown elements not found");
        return;
    }

    // 更新用户信息
    this.elements.countdownNameEl.textContent = state.userProfile?.nickname || '';
    this.elements.countdownAvatarEl.textContent = state.userProfile?.emoji || CONFIG.defaultAvatar;
    
    // 更新倒计时文本 - 使用正确的翻译
    if (this.remainingTime > 0) {
        // 使用 seconds 而不是 time，因为翻译文件中使用的是 {seconds}
        this.elements.countdownTextEl.textContent = utils.formatString(
            utils.getTranslation("mainPage.cooldownMsg"),
            { seconds: this.remainingTime }  // 改为 seconds
        );
    } else {
        this.elements.countdownTextEl.textContent = '';
    }
    
    console.log("Countdown updated:", this.remainingTime, "seconds remaining");
}
};