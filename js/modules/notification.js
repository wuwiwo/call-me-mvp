// /src/modules/notification.js
import {
    CONFIG
} from './config.js';
import {
    utils
} from './utils.js';
import {
    state
} from './state.js';
import {
    soundManager
} from './sounds.js';

// 通知系统管理
export const notification = {
    // DOM元素
    element: null,

    // 初始化
    init(domElement) {
        this.element = domElement;
    },

    // 显示通知
    // /src/modules/notification.js
    show(message, isSuccess = true) {
        soundManager.playNotificationSound(isSuccess);
        const icon = isSuccess ? "paper-plane" : "times-circle";
        const statusClass = isSuccess ? "sent" : "error";

        // 确保 message 是字符串，不是翻译键
        let displayMessage = message;
        if (typeof message === 'string' && message.includes('.')) {
            // 如果是翻译键，尝试获取翻译
            displayMessage = utils.getTranslation(message);
        }

        this.element.innerHTML = `<i class="fas fa-${icon}"></i> ${displayMessage}`;
        this.element.className = `notification ${statusClass}`;
        this.element.classList.add("show");

        setTimeout(
            () => this.element.classList.remove("show"),
            CONFIG.notificationDuration
        );
    },

    // 添加历史记录
    addHistoryRecord(message, isSuccess) {
        const history = JSON.parse(localStorage.getItem("notificationHistory")) || [];
        history.unshift({
            timestamp: new Date().toISOString(),
            message,
            nickname: state.userProfile?.nickname || utils.getTranslation("common.unregistered"),
            emoji: state.userProfile?.emoji || CONFIG.defaultAvatar,
            _status: isSuccess ? "success" : "error",
            webhook: CONFIG.webhookUrl
        });
        localStorage.setItem(
            "notificationHistory",
            JSON.stringify(history.slice(0, CONFIG.maxHistoryRecords))
        );
    },

// 发送Webhook通知
    async sendNotification(buttonData) {
        console.log("sendNotification called with:", buttonData);

        // 用户资料检查 - 这是您修改的部分
        if (!state.userProfile) {
            this.show(utils.getTranslation("profile.bindTitle"), false);
            console.log("未检测到用户资料，显示绑定提示");

            // 3秒后刷新页面
            setTimeout(() => {
                console.log("刷新页面以显示绑定窗口");
                location.reload(true);
            }, 3000);

            return false;
        }

        state.isRequestPending = true;
        localStorage.setItem("lastClickTime", Date.now());

        console.log("Making fetch request to:", CONFIG.webhookUrl);

        try {
            const params = new URLSearchParams({
                message: buttonData.message,
                nickname: state.userProfile.nickname,
                emoji: state.userProfile.emoji
            });

            const url = `${CONFIG.webhookUrl}?${params}`;
            console.log("Full request URL:", url);

            const response = await fetch(url, {
                method: "GET",
                mode: "cors"
            });

            console.log("Response status:", response.status, response.statusText);

            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
            }

            const responseText = await response.text();
            console.log("Response text:", responseText);

            // 确保使用翻译文本而不是翻译键
            this.show(utils.getTranslation("notification.successMsg"));
            this.addHistoryRecord(buttonData.message, true);
            return true;
        } catch (error) {
            console.error("Fetch error:", error);
            // 使用格式化的错误消息
            const errorMessage = utils.formatString(
                utils.getTranslation("notification.errorMsg"), {
                    error: error.message
                }
            );
            this.show(errorMessage, false);
            this.addHistoryRecord(buttonData.message, false);
            return false;
        } finally {
            state.isRequestPending = false;
            console.log("Request completed, isRequestPending set to false");
        }
    }
};