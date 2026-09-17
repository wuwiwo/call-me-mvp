// /src/modules/notification.js
import {
    CONFIG
} from './config.js';
import {
    utils
} from './utils.js';
import {
    state,
    readJsonSafe
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
    //
    // 这是写入路径，必须比只读路径更宽容：
    // `notificationHistory` 损坏时 readJsonSafe 会回退为空数组（且保留原始值），
    // 我们在此基础上**用新记录覆盖损坏值**，让历史功能自我修复，
    // 而不是让用户永久停在"每次发通知都抛异常"的状态。
    // 注意：仅在数据不可用（非法 JSON / 非数组）时才覆盖，合法数据一律保留。
    addHistoryRecord(message, isSuccess) {
        const existing = readJsonSafe(
            "notificationHistory",
            [],
            v => Array.isArray(v)
        );
        const history = Array.isArray(existing) ? existing : [];
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

        // 用户资料检查 - 这是您修改的部分
        if (!state.userProfile) {
            this.show(utils.getTranslation("profile.bindTitle"), false);

            // 3秒后刷新页面
            setTimeout(() => {
                location.reload();
            }, 3000);

            return false;
        }

        state.isRequestPending = true;
        localStorage.setItem("lastClickTime", Date.now());


        try {
            const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const params = new URLSearchParams({
                message: buttonData.message,
                nickname: state.userProfile.nickname,
                emoji: state.userProfile.emoji,
                msgId: msgId
            });

            const url = `${CONFIG.webhookUrl}?${params}`;

            const response = await fetch(url, {
                method: "GET",
                mode: "cors"
            });


            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
            }

            // 确保使用翻译文本而不是翻译键
            this.show(utils.getTranslation("notification.successMsg"));
            this.addHistoryRecord(buttonData.message, true);
            // 启动已读回执轮询
            this.setReceiptStatus("sent");
            this.pollReadStatus(msgId);
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
        }
    },

    // 设置回执状态条
    setReceiptStatus(state) {
        const el = document.getElementById("receiptStatus");
        if (!el) return;
        const t = utils.getTranslation;
        if (state === "read") {
            el.className = "receipt-status read";
            el.innerHTML = `<i class="fas fa-check-double"></i> ${t("receipt.read")}`;
        } else if (state === "timeout") {
            el.className = "receipt-status timeout";
            el.innerHTML = `<i class="fas fa-hourglass-half"></i> ${t("receipt.timeout")}`;
        } else {
            el.className = "receipt-status sent";
            el.innerHTML = `<i class="fas fa-check"></i> ${t("receipt.sent")}<span class="dots-loader"><span></span><span></span><span></span></span>`;
        }
    },

    // 轮询 JSONBin 等待已读回执
    pollReadStatus(msgId) {
        const binUrl = CONFIG.jsonBin?.binUrl;
        if (!binUrl || !msgId) return;
        const maxAttempts = 15; // ~30s（每 2s 一次）
        let attempts = 0;

        const poll = async () => {
            attempts++;
            if (attempts > maxAttempts) {
                this.setReceiptStatus("timeout");
                return;
            }
            try {
                const res = await fetch(binUrl, { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    const record = data.record || data;
                    if (record.msgId === msgId && record.status === "read") {
                        this.setReceiptStatus("read");
                        return;
                    }
                }
            } catch (e) {
                console.error("已读回执轮询失败:", e);
            }
            setTimeout(poll, 2000);
        };
        setTimeout(poll, 2000);
    }
};