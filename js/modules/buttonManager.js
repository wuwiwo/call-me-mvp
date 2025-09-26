import {
    CONFIG
} from "./config.js";
import {
    utils
} from "./utils.js";
import {
    state
} from "./state.js";
import {
    notification
} from "./notification.js";
import {
    countdown
} from "./countdown.js";
import {
    soundManager
} from "./sounds.js";

export const buttonManager = {
    elements: null,
    customButtons: [],
    activeButtonGroup: "default",

    /**
     * 初始化按钮管理系统
     * @param {HTMLElement} container - 按钮容器元素
     */
    // 在 buttonManager.js 的 init 方法中添加调试
    init(container) {
        console.log("buttonManager 初始化开始");

        // 初始化DOM引用
        this.elements = {
            container: container,
            editModal: document.getElementById("buttonEditModal"),
            addButton: document.getElementById("addCustomButton"),
            saveButtons: document.getElementById("saveButtons"),
            resetButtons: document.getElementById("resetButtons"),
            closeEditModal: document.getElementById("closeButtonEdit"),
            customButtonsArea: document.getElementById("customButtonsArea")
        };

        console.log("找到的容器:", !!this.elements.container);

        // 加载配置并渲染
        this.loadButtonConfig();
        this.setupEventListeners();
        this.renderButtons();
        this.validateButtonCount();

        console.log("Button Manager 初始化完成，按钮数量:", this.customButtons.length);

        // 测试方法绑定
        console.log("handleButtonClick 方法:", typeof this.handleButtonClick);
    },

    /**
     * 从localStorage加载按钮配置
     */
    loadButtonConfig() {
        try {
            const savedConfig = localStorage.getItem("buttonConfig");
            if (savedConfig) {
                const {
                    buttons,
                    activeGroup
                } = JSON.parse(savedConfig);
                this.customButtons = buttons || [];
                this.activeButtonGroup = activeGroup || "default";
            } else {
                // 使用默认配置
                this.customButtons = JSON.parse(
                    JSON.stringify(CONFIG.buttons.defaultButtons)
                );
                this.saveConfig();
            }
        } catch (e) {
            console.error("Failed to load button config:", e);
            this.resetToDefault();
        }
    },

    /**
     * 保存当前配置到localStorage
     */
    saveConfig() {
        localStorage.setItem(
            "buttonConfig",
            JSON.stringify({
                buttons: this.customButtons,
                activeGroup: this.activeButtonGroup
            })
        );
    },

    /**
     * 设置所有事件监听器
     */
    setupEventListeners() {
        // 编辑按钮点击
        document.getElementById("editButtons")?.addEventListener("click", e => {
            e.stopPropagation();
            this.showEditModal();
        });

        // 添加自定义按钮
        this.elements.addButton?.addEventListener("click", () => {
            const currentCustomCount =
                this.customButtons.length -
                CONFIG.buttons.defaultButtons.length;

            // 检查是否超过最大自定义按钮数量
            if (currentCustomCount >= CONFIG.buttons.maxCustomButtons) {
                notification.show(
                    `最多只能添加 ${CONFIG.buttons.maxCustomButtons} 个自定义按钮`,
                    false
                );
                return;
            }

            this.addCustomButtonForm();
        });

        // 保存配置
        this.elements.saveButtons?.addEventListener("click", () =>
            this.saveButtonConfig()
        );

        // 重置按钮
        this.elements.resetButtons?.addEventListener("click", () => {
            if (confirm(utils.getTranslation("profile.confirmReset"))) {
                this.resetToDefault();
            }
        });

        // 关闭模态框
        this.elements.closeEditModal?.addEventListener("click", () => {
            this.elements.editModal.classList.remove("show");
        });

        // 点击模态框外部关闭
        window.addEventListener("click", e => {
            if (e.target === this.elements.editModal) {
                this.elements.editModal.classList.remove("show");
            }
        });
    },

    /**
     * 渲染所有按钮到界面
     */
    // /src/modules/buttonManager.js

    /**
     * 渲染所有按钮到界面
     */
    renderButtons() {
        if (!this.elements.container) {
            console.error("按钮容器未找到!");
            return;
        }

        console.log("开始渲染按钮，数量:", this.customButtons.length);

        this.elements.container.innerHTML = "";

        this.customButtons.forEach((button, index) => {
            console.log("渲染按钮:", index, button);
            const buttonEl = this.createButtonElement(button, index);

            // 检查创建的元素
            console.log("创建的按钮元素:", buttonEl);
            console.log("按钮点击监听器数量:", buttonEl.addEventListener ? "已添加" : "未添加");

            this.elements.container.appendChild(buttonEl);
        });

        console.log("按钮渲染完成");
    },

    // /src/modules/buttonManager.js

    /**
     * 创建按钮元素
     * @param {Object} button - 按钮配置对象
     * @param {number} index - 按钮索引
     */
    createButtonElement(button, index) {
        const buttonEl = document.createElement('div');
        buttonEl.className = 'bubble-btn';
        buttonEl.setAttribute('data-button-index', index);
        buttonEl.innerHTML = `
        <div class="bubble-content">
            <i class="fas fa-${button.icon}"></i>
            <span>${button.message}</span>
        </div>
    `;

        // 添加详细的点击事件日志
        buttonEl.addEventListener('click', (e) => {
          //  console.log("=== 按钮点击事件开始 ===");


            // 确保调用 handleButtonClick
            this.handleButtonClick(button);

          //  console.log("=== 按钮点击事件结束 ===");
        });

        return buttonEl;
    },


/**
     * 处理按钮点击事件
     * @param {Object} button - 按钮配置对象
     */
    handleButtonClick(button) {
        console.log("handleButtonClick 被调用，按钮:", button);

        // 移除这里的用户资料检查，让 notification.sendNotification 来处理
        // if (!state.userProfile) {
        //     console.log("用户未登录，显示绑定模态框");
        //     notification.show(utils.getTranslation("profile.bindTitle"), false);
        //     return;
        // }

        if (!state.canClick) {
            console.log("点击冷却中，无法操作");
            const lastClickTime = localStorage.getItem('lastClickTime');
            if (lastClickTime) {
                const remaining = CONFIG.cooldownTime - Math.floor((Date.now() - parseInt(lastClickTime)) / 1000);
                notification.show(`请等待 ${remaining} 秒后再试`, false);
            }
            return;
        }

        console.log("开始处理按钮点击...");
        
        // 立即更新状态并保存时间
        state.canClick = false;
        state.isRequestPending = true;
        const clickTime = Date.now();
        localStorage.setItem('lastClickTime', clickTime.toString());
        
        // 启动倒计时
        countdown.start();

        console.log("调用 notification.sendNotification...");
        
        // 现在会调用 notification.sendNotification，其中的用户资料检查会生效
        notification.sendNotification({
            message: button.message,
            nickname: state.userProfile?.nickname || "未设置",
            emoji: state.userProfile?.emoji || CONFIG.defaultAvatar
        })
        .then(success => {
            console.log("通知发送结果:", success);
            if (!success) {
                console.log("通知发送失败，停止倒计时");
                countdown.stop();
                // 失败时恢复点击状态
                state.canClick = true;
                state.isRequestPending = false;
                localStorage.removeItem('lastClickTime');
            }
        })
        .catch(error => {
            console.error("通知发送出错:", error);
            countdown.stop();
            // 出错时恢复点击状态
            state.canClick = true;
            state.isRequestPending = false;
            localStorage.removeItem('lastClickTime');
        });
    },

    /**
     * 显示按钮编辑模态框
     */
    showEditModal() {
        if (!this.elements.editModal) {
            +
            console.error("Edit modal element not found!");
            return;
        }

        // 初始化图标选择器
        this.initIconSelectors();

        // 填充默认按钮
        CONFIG.buttons.defaultButtons.forEach((defaultBtn, index) => {
            const existingBtn = this.customButtons[index] || defaultBtn;
            const textInput = document.getElementById(`button${index + 1}Text`);
            const iconSelect = document.getElementById(
                `button${index + 1}Icon`
            );

            if (textInput) textInput.value = existingBtn.message;
            if (iconSelect) {
                // 确保使用配置中的图标而非随机
                iconSelect.value = existingBtn.icon || defaultBtn.icon;
                // 添加所有图标选项
                if (iconSelect.options.length <= 1) {
                    iconSelect.innerHTML = `
                    <option value="${defaultBtn.icon}">${
                        defaultBtn.icon
                    }</option>
                    <option value="random">${utils.getTranslation(
                        "profile.randomIcon"
                    )}</option>
                    ${this.generateIconOptions()}
                `;
                }
            }
        });

        // 清空并重新渲染自定义按钮
        this.elements.customButtonsArea.innerHTML = "";
        const customButtonCount = Math.max(
            0,
            this.customButtons.length - CONFIG.buttons.defaultButtons.length
        );
        for (let i = 0; i < customButtonCount; i++) {
            const btnIndex = CONFIG.buttons.defaultButtons.length + i;
            this.addCustomButtonForm(this.customButtons[btnIndex]);
        }

        // 显示模态框
        this.elements.editModal.classList.add("show");
        console.log("Edit modal shown");
    },

    /**
     * 初始化图标选择器
     */
    initIconSelectors() {
        const options = CONFIG.buttons.availableIcons
            .map(icon => `<option value="${icon}">${icon}</option>`)
            .join("");

        document.querySelectorAll(".icon-selector").forEach(select => {
            if (!select.innerHTML.includes("option")) {
                select.innerHTML = `<option value="random">随机图标</option>${options}`;
            }
        });
    },

    /**
     * 添加自定义按钮表单
     * @param {Object} [buttonData] - 现有按钮数据
     */
    addCustomButtonForm(buttonData) {
        const form = document.createElement("div");
        form.className = "custom-button-form";
        form.innerHTML = `
        <div class="form-group">
            <div class="form-header">
                <label>${utils.getTranslation("profile.customButton")}</label>
                <button class="remove-btn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <input type="text" class="btn-text" 
                   value="${buttonData?.message || ""}"
                   maxlength="${CONFIG.buttons.maxLength}"
                   placeholder="${utils.formatString(
                       utils.getTranslation("profile.buttonTextPlaceholder"),
                       { maxLength: CONFIG.buttons.maxLength }
                   )}">
            <select class="icon-selector">
                <option value="random">${utils.getTranslation(
                    "profile.randomIcon"
                )}</option>
                ${this.generateIconOptions(buttonData?.icon)}
            </select>
        </div>
    `;

        // 设置选中图标
        if (buttonData?.icon && buttonData.icon !== "random") {
            form.querySelector(".icon-selector").value = buttonData.icon;
        }

        // 绑定删除事件
        form.querySelector(".remove-btn").addEventListener("click", () => {
            form.remove();
        });

        this.elements.customButtonsArea.appendChild(form);
    },

    /**
     * 生成图标选项HTML
     * @param {string} [selectedIcon] - 当前选中的图标
     */
    generateIconOptions(selectedIcon) {
        return CONFIG.buttons.availableIcons
            .map(
                icon =>
                `<option value="${icon}" ${
                        selectedIcon === icon ? "selected" : ""
                    }>${icon}</option>`
            )
            .join("");
    },

    /**
     * 保存按钮配置
     */
    saveButtonConfig() {
        const newButtons = [];

        // 收集默认按钮
        CONFIG.buttons.defaultButtons.forEach((_, index) => {
            const textInput = document.getElementById(`button${index + 1}Text`);
            const iconSelect = document.getElementById(
                `button${index + 1}Icon`
            );

            newButtons.push({
                id: `default_${index + 1}`,
                message: textInput?.value.trim() ||
                    CONFIG.buttons.defaultButtons[index].message,
                icon: iconSelect?.value ||
                    CONFIG.buttons.defaultButtons[index].icon
            });
        });

        // 收集自定义按钮
        document.querySelectorAll(".custom-button-form").forEach(form => {
            const text = form.querySelector(".btn-text")?.value.trim();
            const icon = form.querySelector(".icon-selector")?.value;

            if (text) {
                newButtons.push({
                    id: `custom_${Date.now()}`,
                    message: text,
                    icon: icon || "circle"
                });
            }
        });

        // 验证并保存
        if (
            newButtons.length >
            CONFIG.buttons.maxCustomButtons +
            CONFIG.buttons.defaultButtons.length
        ) {
            notification.show(
                `最多只能添加 ${CONFIG.buttons.maxCustomButtons} 个自定义按钮`,
                false
            );
            return;
        }

        this.customButtons = newButtons;
        this.saveConfig();
        this.renderButtons();

        notification.show("按钮配置已保存");
        this.elements.editModal.classList.remove("show");
    },

    /**
     * 重置为默认按钮配置
     */
    resetToDefault() {
        this.customButtons = JSON.parse(
            JSON.stringify(CONFIG.buttons.defaultButtons)
        );
        this.saveConfig();
        this.renderButtons();
        this.elements.editModal.classList.remove("show");
        notification.show("已恢复默认按钮");
    },

    /**
     * 验证按钮数量
     */
    validateButtonCount() {
        const maxAllowed =
            CONFIG.buttons.defaultButtons.length +
            CONFIG.buttons.maxCustomButtons;
        if (this.customButtons.length > maxAllowed) {
            this.customButtons = this.customButtons.slice(0, maxAllowed);
            this.saveConfig();
        }
    }
};