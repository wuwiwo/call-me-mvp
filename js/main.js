import { CONFIG } from './modules/config.js';
import { state } from './modules/state.js';
import { utils } from './modules/utils.js';
import { profile } from './modules/profile.js';
import { language } from './modules/language.js';
import { theme } from './modules/theme.js';
import { notification } from './modules/notification.js';
import { countdown } from './modules/countdown.js';
import { buttonManager } from './modules/buttonManager.js';
import { soundManager } from './modules/sounds.js';
import { onboarding } from './modules/onboarding.js';
import { password } from './modules/password.js';

class CallMeApp {
    // /src/main.js
    constructor() {
        this.initElements();
        this.initModules();
        this.addHistoryButton();
    }

    // /src/main.js
    initElements() {
        // 使用更可靠的选择器
        this.elements = {
            // 主界面元素
            notifyBtns: document.querySelectorAll('.bubble-btn'),
            countdownEl: document.getElementById('countdown'),
            notificationEl: document.getElementById('notification'),

            // 新的语言下拉菜单元素
            languageToggle: document.getElementById('languageToggle'),
            languageMenu: document.getElementById('languageMenu'),
            currentLanguage: document.getElementById('currentLanguage'),

            titleEl: document.getElementById('title'),
            subtitleEl: document.getElementById('subtitle'),
            userInfoEl: document.getElementById('userInfo'),
            userNameEl: document.getElementById('userName'),
            userAvatarEl: document.getElementById('userAvatar'),
            countdownNameEl: document.getElementById('countdownName'),
            countdownTextEl: document.getElementById('countdownText'),
            countdownAvatarEl: document.getElementById('countdownAvatar'),

            // 使用更精确的选择器
            editProfileBtn: document.getElementById('editProfile'),
            profileModal: document.getElementById('profileModal'),
            closeModalBtn: document.querySelector('#profileModal .close-btn'),
            saveProfileBtn: document.getElementById('saveProfile'),
            nicknameInput: document.getElementById('nickname'),
            emojiOptions: document.querySelectorAll('.emoji-option'),
            modalTitle: document.getElementById('modalTitle'),
            buttonContainer: document.querySelector('.bubble-container'),

            // 按钮编辑模态框元素
            buttonEditModal: document.getElementById('buttonEditModal'),
            closeButtonEdit: document.getElementById('closeButtonEdit'),
            saveButtons: document.getElementById('saveButtons'),
            resetButtons: document.getElementById('resetButtons'),
            addCustomButton: document.getElementById('addCustomButton')
        };
    }

    initModules() {
        try {
            soundManager.preload().catch((e) => console.warn('音效预加载失败:', e));

            // 先初始化密码验证模块（最优先）
            password.init(this.elements);

            // 初始化语言模块（确保最先初始化）
            language.init(this.elements);

            // 初始化主题模块：把已持久化的主题同步到 <html data-theme>。
            // 防闪由 <head> 内联脚本在 CSS 前完成，这里负责最终定值与非法值纠正。
            theme.init();

            // 然后初始化profile模块
            profile.init(this.elements);

            // 检查用户资料
            if (!state.userProfile) {
                profile.showModal(true);
            } else {
                profile.loadProfile();
            }

            // 初始化其他模块
            notification.init(this.elements.notificationEl);
            countdown.init(this.elements);

            // 恢复冷却状态。
            // 这是页面加载/刷新的**唯一**恢复入口：读 lastClickTime、
            // 决定放行还是启动倒计时，全部由 countdown（唯一责任者）完成。
            // 放在 countdown.init() 之后、buttonManager.init() 之前 ——
            // 按钮绑定点击处理时闸门状态已经正确（CM-006）。
            countdown.restore();

            // 初始化按钮管理器（仅此处初始化一次）
            if (this.elements.buttonContainer) {
                buttonManager.init(this.elements.buttonContainer);
            }

            // 初始化新手引导模块（最后初始化）
            onboarding.init(this.elements);

            // 移除历史记录页面的初始化（已经在history.js中处理）
            // if (window.location.pathname.includes("history.html")) {
            //     history.init({
            //         list: this.elements.historyList,
            //         backBtn: this.elements.historyBack,
            //         clearBtn: this.elements.clearHistory
            //     });
            // }

            // 绑定头像点击事件
            if (this.elements.userAvatarEl) {
                this.elements.userAvatarEl.addEventListener('click', () => {
                    soundManager.playAvatarSound(state.userProfile?.emoji || CONFIG.defaultAvatar);
                });
            }
        } catch (error) {
            console.error('模块初始化失败:', error);
            notification.show('系统初始化失败，请刷新页面', false);
        }
    }

    addHistoryButton() {
        if (!window.location.pathname.includes('history.html')) {
            const historyBtn = document.createElement('button');
            historyBtn.className = 'icon-btn';
            historyBtn.title = utils.getTranslation('history.title');
            historyBtn.innerHTML = '<i class="fas fa-history"></i>';
            historyBtn.addEventListener('click', () => {
                window.location.href = 'history.html';
            });
            const controls = document.querySelector('.top-controls');
            if (controls) controls.prepend(historyBtn);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        new CallMeApp();
    } catch (error) {
        console.error('应用启动失败:', error);
    }
});
