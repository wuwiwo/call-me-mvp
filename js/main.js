import {
    CONFIG
} from "./modules/config.js";
import {
    TRANSLATIONS
} from "./modules/translations.js";
import {
    state
} from "./modules/state.js";
import {
    utils
} from "./modules/utils.js";
import {
    profile
} from "./modules/profile.js";
import {
    language
} from "./modules/language.js";
import {
    notification
} from "./modules/notification.js";
import {
    countdown
} from "./modules/countdown.js";
import {
    buttonManager
} from "./modules/buttonManager.js";
import {
    history
} from "./modules/history.js";
import {
    soundManager
} from "./modules/sounds.js";

class CallMeApp {
    // /src/main.js
    constructor() {
        //console.log("CallMeApp 构造函数调用");
        console.log("初始状态:", {
            userProfile: state.userProfile,
            canClick: state.canClick,
            isRequestPending: state.isRequestPending,
            currentLang: state.currentLang
        });

        this.initElements();
        this.initModules();
        this.checkCooldown();
        this.addHistoryButton();
        // /src/main.js


        console.log("Initial state after cooldown check:", {
            canClick: state.canClick,
            lastClickTime: localStorage.getItem('lastClickTime'),
            currentLang: state.currentLang
        });
        // 添加全局点击监听器用于调试
        this.addDebugListeners();
    }

    addDebugListeners() {
        
        document.addEventListener('click', (e) => {
            if (e.target.closest('.bubble-btn')) {
               // console.log('捕获到气泡按钮点击');
            }
        });
    }

    // /src/main.js
    initElements() {
        // 使用更可靠的选择器
        this.elements = {
            // 主界面元素
            notifyBtns: document.querySelectorAll(".bubble-btn"),
            countdownEl: document.getElementById("countdown"),
            notificationEl: document.getElementById("notification"),
            
            // 新的语言下拉菜单元素
            languageToggle: document.getElementById("languageToggle"),
            languageMenu: document.getElementById("languageMenu"),
            currentLanguage: document.getElementById("currentLanguage"),
            
            titleEl: document.getElementById("title"),
            subtitleEl: document.getElementById("subtitle"),
            userInfoEl: document.getElementById("userInfo"),
            userNameEl: document.getElementById("userName"),
            userAvatarEl: document.getElementById("userAvatar"),
            countdownNameEl: document.getElementById("countdownName"),
            countdownTextEl: document.getElementById("countdownText"),
            countdownAvatarEl: document.getElementById("countdownAvatar"),

            // 使用更精确的选择器
            editProfileBtn: document.getElementById("editProfile"),
            profileModal: document.getElementById("profileModal"),
            closeModalBtn: document.querySelector("#profileModal .close-btn"),
            saveProfileBtn: document.getElementById("saveProfile"),
            nicknameInput: document.getElementById("nickname"),
            emojiOptions: document.querySelectorAll(".emoji-option"),
            modalTitle: document.getElementById("modalTitle"),
            buttonContainer: document.querySelector(".bubble-container"),

            // 按钮编辑模态框元素
            buttonEditModal: document.getElementById("buttonEditModal"),
            closeButtonEdit: document.getElementById("closeButtonEdit"),
            saveButtons: document.getElementById("saveButtons"),
            resetButtons: document.getElementById("resetButtons"),
            addCustomButton: document.getElementById("addCustomButton")
        };

        console.log("Edit Profile Button found:", !!this.elements.editProfileBtn);
        console.log("Profile Modal found:", !!this.elements.profileModal);
        console.log("Language dropdown elements found:", {
            toggle: !!this.elements.languageToggle,
            menu: !!this.elements.languageMenu,
            current: !!this.elements.currentLanguage
        });
    }


    initModules() {
        try {
            soundManager.preload().catch(e => console.warn("音效预加载失败:", e));

            // 先初始化语言模块（确保最先初始化）
            console.log("初始化语言模块...");
            language.init(this.elements);
            console.log("当前语言:", language.getCurrentLanguage());

            // 然后初始化profile模块
            profile.init(this.elements);

            // 检查用户资料
            if (!state.userProfile) {
                console.log("未检测到用户资料，显示绑定窗口");
                profile.showModal(true);
            } else {
                profile.loadProfile();
            }

            // 初始化其他模块
            notification.init(this.elements.notificationEl);
            countdown.init(this.elements);

            // 只在按钮容器存在时初始化按钮管理器（移除重复初始化）
            if (this.elements.buttonContainer && !window.buttonManagerInitialized) {
                buttonManager.init(this.elements.buttonContainer);
                window.buttonManagerInitialized = true; // 防止重复初始化
            }

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
                this.elements.userAvatarEl.addEventListener("click", () => {
                    soundManager.playAvatarSound(
                        state.userProfile?.emoji || CONFIG.defaultAvatar
                    );
                });
            }
        } catch (error) {
            console.error("模块初始化失败:", error);
            notification.show("系统初始化失败，请刷新页面", false);
        }
    }


    checkCooldown() {
        const lastClickTime = localStorage.getItem('lastClickTime');
        if (lastClickTime) {
            const elapsedTime = Math.floor((Date.now() - parseInt(lastClickTime)) / 1000);
            const remainingTime = Math.max(0, CONFIG.cooldownTime - elapsedTime);

            console.log("Cooldown check - elapsed:", elapsedTime, "remaining:", remainingTime);

            if (remainingTime > 0) {
                // 更新状态
                state.canClick = false;

                // 启动倒计时显示
                countdown.start(remainingTime);

                // 设置自动恢复
                setTimeout(() => {
                    state.canClick = true;
                    console.log("Cooldown automatically finished");
                }, remainingTime * 1000);
            }
        }
    }

    addHistoryButton() {
        if (!window.location.pathname.includes("history.html")) {
            const historyBtn = document.createElement("button");
            historyBtn.className = "icon-btn";
            historyBtn.title = utils.getTranslation("history.title");
            historyBtn.innerHTML = '<i class="fas fa-history"></i>';
            historyBtn.addEventListener("click", () => {
                window.location.href = "history.html";
            });
            const controls = document.querySelector(".top-controls");
            if (controls) controls.prepend(historyBtn);
        }
    }
}


// 修改 main.js 中的按钮管理器初始化部分
// 确保在DOM完全加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM已加载，启动应用");
    try {
        const app = new CallMeApp();

        // 确保按钮容器存在后再初始化按钮管理器
        const buttonContainer = document.querySelector(".bubble-container");
        if (buttonContainer) {
            // 延迟初始化以确保所有依赖项都已加载
            setTimeout(() => {
                buttonManager.init(buttonContainer);
                console.log("按钮管理器初始化完成");
            }, 100);
        } else {
            console.error("按钮容器未找到!");
        }
    } catch (error) {
        console.error("应用启动失败:", error);
    }
});