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

    // ── 已读回执轮询的生命周期状态（CM-008） ──
    //
    // 轮询必须**可取消且单一所有权**：
    //   - receiptPollTimer：当前活跃轮询的 setTimeout 句柄（null = 无活跃轮询）
    //   - receiptPollGeneration：代际标记。每次停止/重启轮询时自增，
    //     回调只认自己那一代；旧轮回调（含已在飞行的 fetch 的后续）一律直接返回，
    //     绝不再写 #receiptStatus。做法与 CM-006 的 countdown.generation 一致。
    receiptPollTimer: null,
    receiptPollGeneration: 0,

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

        // 不再在这里写 `lastClickTime`（CM-006）。
        // 冷却的持久化由 countdown（唯一责任者）在点击链路里完成；
        // 此前本行与 buttonManager 各写一次，两次时间戳相差一个调用间隔，
        // 属于重复写入。本模块只负责发请求与记录历史。


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

            // 回执轮询：**先让旧轮询失效，再写「已发送」**。
            // 这三句在同一个同步块内执行，因此上一轮的残留回调不可能插进来；
            // 顺序（失效 → 写 sent → 启动新轮询）是状态条只反映最新一次发送的前提。
            // pollReadStatus() 内部也会先停旧轮询，这里显式再停一次是为了让
            // 「发起前必须先失效」成为调用点自身的保证，不依赖被调方的实现细节。
            this.stopReceiptPolling();
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

    /**
     * 设置回执状态条。
     *
     * 参数名用 `statusName` 而不是 `state`：原来叫 `state` 会**遮蔽**本模块
     * 顶部导入的 `state` 模块（CM-008 顺带清理）。当前函数体没用模块 `state`，
     * 所以过去没有实际故障，但一旦以后在这里读 `state.userProfile` 之类的字段，
     * 就会静默读到字符串参数 —— 属真实隐患。
     *
     * @param {"read"|"timeout"|"sent"} statusName 回执状态
     */
    setReceiptStatus(statusName) {
        const el = document.getElementById("receiptStatus");
        if (!el) return;
        const t = utils.getTranslation;
        if (statusName === "read") {
            el.className = "receipt-status read";
            el.innerHTML = `<i class="fas fa-check-double"></i> ${t("receipt.read")}`;
        } else if (statusName === "timeout") {
            el.className = "receipt-status timeout";
            el.innerHTML = `<i class="fas fa-hourglass-half"></i> ${t("receipt.timeout")}`;
        } else {
            el.className = "receipt-status sent";
            el.innerHTML = `<i class="fas fa-check"></i> ${t("receipt.sent")}<span class="dots-loader"><span></span><span></span><span></span></span>`;
        }
    },

    /**
     * 停止当前回执轮询（若有）。
     *
     * 只负责「让轮询失效」：清掉 timer 并自增代际，使已排队的回调与
     * 在飞 fetch 的后续一律作废。**不写状态条** —— 状态条的写入由调用方决定，
     * 这样「停止」不会顺带把界面改成某个状态。
     */
    stopReceiptPolling() {
        // 自增代际：使这一代的所有回调（含 await 之后的续体）失效
        this.receiptPollGeneration += 1;
        if (this.receiptPollTimer !== null) {
            clearTimeout(this.receiptPollTimer);
            this.receiptPollTimer = null;
        }
    },

    /**
     * 轮询 JSONBin 等待已读回执。
     *
     * 可取消 + 单一所有权（CM-008）：
     * - 启动前先 `stopReceiptPolling()`，因此**同一时刻活跃轮询 ≤ 1**；
     * - 每次回调先校验代际，旧轮询直接返回，**不写 #receiptStatus**（含 timeout 分支）；
     * - `await fetch` / `await res.json()` 之后重新校验代际 —— 这两处是异步边界，
     *   期间可能有新一次发送启动了新一轮轮询。
     *   （刻意不用 AbortController：那会改动既有 JSONBin 读取方式；
     *   代际校验已足以保证旧轮询不写状态条。）
     *
     * 单次发送的节奏与语义保持不变：每 2s 一次、最多 15 次（约 30s），
     * 读到 `msgId` 匹配且 `status === "read"` → read，否则 15 次后 → timeout。
     * `binUrl` 缺失或 `msgId` 为空时直接返回（保持原有宽容语义）。
     *
     * @param {string} msgId 本次发送的消息 ID
     */
    pollReadStatus(msgId) {
        const binUrl = CONFIG.jsonBin?.binUrl;
        if (!binUrl || !msgId) return;

        // 单一所有权：开新轮询前先让旧轮询失效
        this.stopReceiptPolling();

        const maxAttempts = 15; // ~30s（每 2s 一次）
        const gen = this.receiptPollGeneration;
        let attempts = 0;

        const poll = async () => {
            // 旧轮询的已排队回调：直接退出，不碰状态条
            if (gen !== this.receiptPollGeneration) return;

            attempts++;
            if (attempts > maxAttempts) {
                // 终态：不再排队下一次，句柄一并清空 ——
                // 这样 `receiptPollTimer !== null` 就等价于"有轮询在等待"，
                // 否则字段会留着已触发的旧 id，让"是否还有轮询"无法据此判断。
                this.receiptPollTimer = null;
                this.setReceiptStatus("timeout");
                return;
            }
            try {
                const res = await fetch(binUrl, { cache: "no-store" });

                // 异步边界后重新确认：期间可能已有新发送接管轮询
                if (gen !== this.receiptPollGeneration) return;

                if (res.ok) {
                    const data = await res.json();

                    if (gen !== this.receiptPollGeneration) return;

                    const record = data.record || data;
                    if (record.msgId === msgId && record.status === "read") {
                        // 终态：同上，清空句柄表示"没有已排队的轮询"
                        this.receiptPollTimer = null;
                        this.setReceiptStatus("read");
                        return;
                    }
                }
            } catch (e) {
                console.error("已读回执轮询失败:", e);
                // 出错后同样要确认代际：旧轮询不得继续排下一次
                if (gen !== this.receiptPollGeneration) return;
            }
            this.receiptPollTimer = setTimeout(poll, 2000);
        };

        this.receiptPollTimer = setTimeout(poll, 2000);
    }
};