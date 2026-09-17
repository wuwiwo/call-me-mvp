import {
    CONFIG
} from "./config.js";
import {
    utils
} from "./utils.js";
import {
    state,
    readJsonSafe
} from "./state.js";
import {
    notification
} from "./notification.js";
import {
    countdown
} from "./countdown.js";

export const buttonManager = {
    elements: null,
    customButtons: [],
    activeButtonGroup: "default",
    displayMode: 'default', // 'default' 或 'minimal'

    /**
     * 初始化按钮管理系统
     * @param {HTMLElement} container - 按钮容器元素
     */
    // 在 buttonManager.js 的 init 方法中添加调试
    init(container) {

        // 初始化DOM引用
        this.elements = {
            container: container,
            editModal: document.getElementById("buttonEditModal"),
            addButton: document.getElementById("addCustomButton"),
            saveButtons: document.getElementById("saveButtons"),
            resetButtons: document.getElementById("resetButtons"),
            closeEditModal: document.getElementById("closeButtonEdit"),
            customButtonsArea: document.getElementById("customButtonsArea"),
            defaultButtonsArea: document.getElementById("defaultButtonsArea"),
            toggleModeBtn: document.getElementById("toggleMode"),
            modeIndicator: document.getElementById("modeIndicator"),
            buttonsEditArea: document.getElementById("buttonsEditArea")
        };


        // 加载配置并渲染
        this.loadButtonConfig();
        this.loadDisplayMode();
        this.setupEventListeners();
        this.renderButtons();
        
        // 验证按钮数量（在渲染后）
        this.validateButtonCount();


        // 测试方法绑定
    },

    /**
     * 从localStorage加载按钮配置
     *
     * 非法 JSON 或错误顶层类型（数组/字符串/数字等）时，
     * 回退到 CONFIG.buttons.defaultButtons，且不抛出异常。
     * 合法旧数据（含未知字段）保持原样读取，不静默改写。
     */
    loadButtonConfig() {
        const savedConfig = localStorage.getItem("buttonConfig");

        if (!savedConfig) {
            // 无配置：使用默认配置并落盘
            this.customButtons = JSON.parse(
                JSON.stringify(CONFIG.buttons.defaultButtons)
            );
            this.activeButtonGroup = "default";
            this.saveConfig();
            return;
        }

        const parsed = readJsonSafe("buttonConfig", null, v =>
            v !== null && typeof v === "object" && !Array.isArray(v)
        );

        if (!parsed) {
            // 损坏或类型错误：回退默认按钮，不删除原始值
            this.customButtons = JSON.parse(
                JSON.stringify(CONFIG.buttons.defaultButtons)
            );
            this.activeButtonGroup = "default";
            return;
        }

        const { buttons, activeGroup } = parsed;
        // buttons 必须是数组，否则视为不可用，回退默认
        this.customButtons = Array.isArray(buttons)
            ? this.normalizeButtonIds(buttons)
            : JSON.parse(JSON.stringify(CONFIG.buttons.defaultButtons));
        this.activeButtonGroup =
            typeof activeGroup === "string" ? activeGroup : "default";
    },

    /**
     * 归一化按钮 ID，让旧配置平滑迁移到规范 ID。
     *
     * 只改 id，不动 message / icon / 未知字段 —— 迁移不许丢内容。
     * 规则：
     * - 前 N 位（N = CONFIG.buttons.defaultButtons.length）若 ID 是 legacy `default_N`
     *   或缺失/非法，改写为 CONFIG.buttons.defaultButtons[位置].id。
     * - 自定义按钮的 ID 一律保留原值（`custom_<timestamp>` 是持久标识，不重写）。
     * - 已经是规范 ID 的默认按钮保持不变（幂等，重复调用无副作用）。
     *
     * 结果只存在于内存与后续保存中；读取阶段**不落盘**，
     * 以免在一个纯读取动作里静默改写用户的存储（落盘发生在下次保存）。
     *
     * @param {Array} buttons 原始按钮数组
     * @returns {Array} 归一化后的按钮数组
     */
    normalizeButtonIds(buttons) {
        const defaultCount = CONFIG.buttons.defaultButtons.length;
        const legacyMap = CONFIG.buttons.legacyDefaultIdMap || {};

        return buttons.map((btn, index) => {
            if (!btn || typeof btn !== "object") return btn;

            const canonical =
                index < defaultCount
                    ? CONFIG.buttons.defaultButtons[index].id
                    : null;

            // 只处理默认按钮位置
            if (canonical === null) return btn;

            const id = btn.id;
            const isLegacy = Object.prototype.hasOwnProperty.call(
                legacyMap,
                String(id)
            );
            const isMissing = typeof id !== "string" || id === "";

            if (isLegacy || isMissing) {
                return { ...btn, id: canonical };
            }
            return btn;
        });
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
        const editButton = document.getElementById("editButtons");
        if (editButton) {
            // 移除旧的事件监听（防止重复绑定）
            editButton.replaceWith(editButton.cloneNode(true));
            // 重新获取元素并绑定事件
            document.getElementById("editButtons")?.addEventListener("click", e => {
                e.stopPropagation();
                this.showEditModal();
            });
        }

        // 切换显示模式（使用事件委托）
        const toggleModeBtn = document.getElementById("toggleMode");
        if (toggleModeBtn) {
            // 移除旧的事件监听
            toggleModeBtn.replaceWith(toggleModeBtn.cloneNode(true));
            // 重新获取元素并绑定事件
            document.getElementById("toggleMode")?.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDisplayMode();
            });
        }

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
            this.showConfirmDialog(
                utils.getTranslation("profile.confirmReset"),
                () => this.resetToDefault()
            );
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

        // 图标选择器：事件委托（表单每次打开都会重建）
        const editModal = this.elements.editModal;
        if (editModal && !editModal.dataset.iconPickerBound) {
            editModal.dataset.iconPickerBound = "1";

            editModal.addEventListener("click", e => {
                // 点击触发器：切换菜单
                const trigger = e.target.closest(".icon-picker-trigger");
                if (trigger) {
                    const picker = trigger.closest(".icon-picker");
                    const menu = picker.querySelector(".icon-picker-menu");
                    const isOpen = menu.classList.contains("show");
                    editModal.querySelectorAll(".icon-picker.open").forEach(p => {
                        if (p !== picker) {
                            p.classList.remove("open");
                            p.querySelector(".icon-picker-menu")?.classList.remove("show");
                        }
                    });
                    menu.classList.toggle("show", !isOpen);
                    picker.classList.toggle("open", !isOpen);
                    return;
                }

                // 点击选项：选中并关闭
                const option = e.target.closest(".icon-picker-option");
                if (option) {
                    const picker = option.closest(".icon-picker");
                    const value = option.dataset.value;
                    const iconClass = option.querySelector("i").className;
                    const label = option.querySelector("span").textContent;

                    picker.dataset.value = value;
                    const triggerEl = picker.querySelector(".icon-picker-trigger");
                    triggerEl.querySelector("i").className = iconClass;
                    triggerEl.querySelector(".icon-picker-label").textContent = label;
                    picker.querySelectorAll(".icon-picker-option").forEach(o =>
                        o.classList.toggle("selected", o === option)
                    );
                    picker.classList.remove("open");
                    picker.querySelector(".icon-picker-menu")?.classList.remove("show");
                }
            });

            // 点击外部关闭所有菜单
            document.addEventListener("click", e => {
                if (!e.target.closest(".icon-picker")) {
                    editModal.querySelectorAll(".icon-picker.open").forEach(p => {
                        p.classList.remove("open");
                        p.querySelector(".icon-picker-menu")?.classList.remove("show");
                    });
                }
            });
        }
    },

    /**
     * 渲染所有按钮到界面
     */
    renderButtons() {
        if (!this.elements.container) {
            console.error("按钮容器未找到!");
            return;
        }


        this.elements.container.innerHTML = "";

        // 根据显示模式应用不同的样式
        if (this.displayMode === 'minimal') {
            this.elements.container.classList.add('minimal-mode');
        } else {
            this.elements.container.classList.remove('minimal-mode');
        }

        this.customButtons.forEach((button, index) => {
            const buttonEl = this.createButtonElement(button, index);

            // 检查创建的元素

            this.elements.container.appendChild(buttonEl);
        });

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

        buttonEl.addEventListener('click', () => {
            this.handleButtonClick(button);
        });

        return buttonEl;
    },


/**
     * 处理按钮点击事件
     * @param {Object} button - 按钮配置对象
     */
    handleButtonClick(button) {

        // 移除这里的用户资料检查，让 notification.sendNotification 来处理
        // if (!state.userProfile) {
        //     notification.show(utils.getTranslation("profile.bindTitle"), false);
        //     return;
        // }

        if (!state.canClick) {
            const lastClickTime = localStorage.getItem('lastClickTime');
            if (lastClickTime) {
                const remaining = CONFIG.cooldownTime - Math.floor((Date.now() - parseInt(lastClickTime)) / 1000);
                notification.show(`请等待 ${remaining} 秒后再试`, false);
            }
            return;
        }

        
        // 立即更新状态并保存时间
        state.canClick = false;
        state.isRequestPending = true;
        const clickTime = Date.now();
        localStorage.setItem('lastClickTime', clickTime.toString());
        
        // 启动倒计时
        countdown.start();

        
        // 现在会调用 notification.sendNotification，其中的用户资料检查会生效
        notification.sendNotification({
            message: button.message,
            nickname: state.userProfile?.nickname || "未设置",
            emoji: state.userProfile?.emoji || CONFIG.defaultAvatar
        })
        .then(success => {
            if (!success) {
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
            console.error("Edit modal element not found!");
            return;
        }

        // 清空区域
        this.elements.defaultButtonsArea.innerHTML = "";
        this.elements.customButtonsArea.innerHTML = "";

        // 按身份切分按钮，而不是单纯按位置：
        // 前 N 个位置对应默认按钮（N = CONFIG.buttons.defaultButtons.length），
        // 其余为自定义按钮。这是历史数据格式决定的（默认按钮不能删除、始终占前 N 位）。
        const defaultCount = CONFIG.buttons.defaultButtons.length;
        const customList = this.customButtons.slice(defaultCount);

        // 渲染默认按钮
        CONFIG.buttons.defaultButtons.forEach((defaultBtn, index) => {
            // 优先用已保存的按钮内容，缺失时回退配置默认值
            const existingBtn = this.customButtons[index] || defaultBtn;
            this.addDefaultButtonForm(existingBtn, index);
        });

        // 渲染自定义按钮
        customList.forEach(btn => {
            // 把未知字段挂在表单上，保存时原样带回（未知字段保留策略）
            const withExtra =
                btn && typeof btn === "object"
                    ? { ...btn, __extraFields: this.pickExtraFields(btn) }
                    : btn;
            this.addCustomButtonForm(withExtra);
        });

        // 更新模式显示
        this.updateModeDisplay();

        // 显示模态框
        this.elements.editModal.classList.add("show");
        
        // 更新模式显示
        setTimeout(() => {
            this.updateModeDisplay();
        }, 100);
    },

    /**
     * 创建图标选择器 HTML（带预览的网格弹出）
     * @param {string} [selectedIcon] - 当前选中的图标
     * @param {string} [id] - 选择器 ID（默认按钮用）
     */
    createIconPicker(selectedIcon, id) {
        const current = selectedIcon && selectedIcon !== "random" ? selectedIcon : "random";
        const randomLabel = utils.getTranslation("profile.randomIcon");

        const optionsHtml = CONFIG.buttons.availableIcons
            .map(icon => {
                const name = utils.getTranslation("icons." + icon);
                return `<button type="button" class="icon-picker-option${
                    icon === selectedIcon ? " selected" : ""
                }" data-value="${icon}">
                    <i class="fas fa-${icon}"></i>
                    <span>${name}</span>
                </button>`;
            })
            .join("");

        const triggerIcon = current === "random" ? "shuffle" : current;
        const triggerLabel = current === "random" ? randomLabel : utils.getTranslation("icons." + current);

        return `<div class="icon-picker" data-value="${current}"${id ? ` id="${id}"` : ""}>
            <button type="button" class="icon-picker-trigger">
                <i class="fas fa-${triggerIcon}"></i>
                <span class="icon-picker-label">${triggerLabel}</span>
                <i class="fas fa-chevron-down icon-picker-caret"></i>
            </button>
            <div class="icon-picker-menu">
                <button type="button" class="icon-picker-option${
                    current === "random" ? " selected" : ""
                }" data-value="random">
                    <i class="fas fa-shuffle"></i>
                    <span>${randomLabel}</span>
                </button>
                ${optionsHtml}
            </div>
        </div>`;
    },

    /**
     * 添加默认按钮表单
     * @param {Object} buttonData - 按钮数据
     * @param {number} index - 按钮索引
     */
    addDefaultButtonForm(buttonData, index) {
        const form = document.createElement("div");
        form.className = "button-edit-item";
        // 默认按钮的规范 ID 由 CONFIG.buttons.defaultButtons[index] 在保存时直接提供，
        // 不需要在表单上再存一份身份（位置本身就是身份）。
        form.innerHTML = `
            <div class="form-group">
                <div class="form-header">
                    <label>按钮 ${index + 1}</label>
                </div>
                <input type="text" class="btn-text" 
                       id="button${index + 1}Text"
                       value="${buttonData?.message || ""}"
                       maxlength="${CONFIG.buttons.maxLength}"
                       placeholder="${utils.formatString(
                           utils.getTranslation("profile.buttonTextPlaceholder"),
                           { maxLength: CONFIG.buttons.maxLength }
                       )}">
                ${this.createIconPicker(buttonData?.icon, `button${index + 1}Icon`)}
            </div>
        `;

        this.elements.defaultButtonsArea.appendChild(form);
    },

    /**
     * 添加自定义按钮表单
     * @param {Object} [buttonData] - 现有按钮数据
     *
     * buttonData.id 会被写入 form.dataset.buttonId，保存时原样回写 ——
     * 这是"编辑已有自定义按钮不改变 ID"的唯一依据。
     * 新建按钮（无 buttonData.id）时 dataset 为空，保存时才生成新 ID。
     */
    addCustomButtonForm(buttonData) {
        const form = document.createElement("div");
        form.className = "custom-button-form";
        // 已有按钮：记录其持久 ID（含 legacy custom_timestamp），保存时原样保留。
        // 新建按钮：不写 dataset，保存时才分配新 ID。
        if (buttonData && typeof buttonData.id === "string" && buttonData.id) {
            form.dataset.buttonId = buttonData.id;
        }
        // 未被编辑过的未知字段：挂在这里随表单一起走，保存时原样带回
        if (buttonData && buttonData.__extraFields) {
            form.__extraFields = buttonData.__extraFields;
        }
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
            ${this.createIconPicker(buttonData?.icon)}
        </div>
    `;

        // 图标回显由 createIconPicker(buttonData?.icon) 统一处理，
        // 它会根据 icon 计算 trigger 图标、label 与 data-value（含 random 分支）

        // 绑定删除事件
        form.querySelector(".remove-btn").addEventListener("click", () => {
            form.remove();
        });

        this.elements.customButtonsArea.appendChild(form);
    },

    /**
     * 保存按钮配置
     *
     * ID 策略（CM-004）：
     * - 默认按钮：ID 直接取自 CONFIG.buttons.defaultButtons[index].id，不再按位置生成 `default_N`。
     * - 自定义按钮：表单携带的 dataset.buttonId 原样保留（含 legacy `custom_<timestamp>`）；
     *   只有**新建**按钮（无 dataset.buttonId）才生成新的唯一 ID。
     *
     * 这样"数组位置"不再是身份来源，编辑某个按钮不会牵连其他按钮的 ID。
     */
    saveButtonConfig() {
        const newButtons = [];

        // 收集默认按钮
        CONFIG.buttons.defaultButtons.forEach((defaultBtn, index) => {
            const textInput = document.getElementById(`button${index + 1}Text`);
            const iconPicker = document.getElementById(`button${index + 1}Icon`);

            // 复用同位置已保存按钮的未知字段，避免未知字段在保存时丢失
            const existing = this.customButtons[index];
            const preserved = existing ? this.pickExtraFields(existing) : {};

            newButtons.push({
                ...preserved,
                id: defaultBtn.id,
                message: textInput?.value.trim() || defaultBtn.message,
                icon: iconPicker?.dataset.value || defaultBtn.icon
            });
        });

        // 收集自定义按钮
        document.querySelectorAll(".custom-button-form").forEach(form => {
            const text = form.querySelector(".btn-text")?.value.trim();
            const icon = form.querySelector(".icon-picker")?.dataset.value;

            if (text) {
                // 已有按钮：沿用表单携带的原 ID；新建按钮：分配新 ID
                const carried = form.dataset.buttonId;
                const preserved = form.__extraFields || {};
                newButtons.push({
                    ...preserved,
                    id: carried || this.createCustomButtonId(newButtons),
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
     * 取出按钮中不属于已知字段的部分，用于保存时保留未知字段。
     * 已知字段：id / message / icon —— 它们由表单与配置显式提供。
     * @param {Object} button
     * @returns {Object} 待保留的未知字段（无则返回空对象）
     */
    pickExtraFields(button) {
        if (!button || typeof button !== "object") return {};
        const known = new Set(["id", "message", "icon"]);
        const extra = {};
        for (const [k, v] of Object.entries(button)) {
            if (!known.has(k)) extra[k] = v;
        }
        return extra;
    },

    /**
     * 生成新的自定义按钮 ID。
     *
     * 唯一性检查必须同时覆盖两处，否则同一批次里新增多个按钮会撞号：
     * 1. `this.customButtons` —— 已在存储中的按钮
     * 2. `pending` —— 本次保存中已经分配出去、但尚未写回 this.customButtons 的 ID
     *
     * 用时间戳 + 单调递增计数器：Date.now() 在同一毫秒内会被多次调用
     * （例如一次保存里新增两个按钮），纯时间戳必然撞号。
     *
     * @param {Array} [pending] 本次保存已构造的按钮数组
     * @returns {string}
     */
    createCustomButtonId(pending) {
        const prefix = CONFIG.buttons.customIdPrefix || "custom_";
        const used = new Set();
        for (const list of [this.customButtons, pending || []]) {
            for (const b of list) {
                if (b && typeof b.id === "string") used.add(b.id);
            }
        }

        let seq = this.__idSeq || 0;
        let candidate = `${prefix}${Date.now()}`;
        while (used.has(candidate)) {
            seq += 1;
            candidate = `${prefix}${Date.now() + seq}`;
        }
        this.__idSeq = seq;
        return candidate;
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
     * 显示确认对话框（Notion 风格模态框，替代原生 confirm）
     * @param {string} message - 提示消息
     * @param {Function} onConfirm - 确认回调
     */
    showConfirmDialog(message, onConfirm) {
        const modal = document.createElement('div');
        modal.className = 'modal show confirm-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${utils.getTranslation("common.confirm")}</h2>
                </div>
                <div class="modal-body">
                    <p class="confirm-message">${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn confirm-cancel-btn">${utils.getTranslation("common.cancel")}</button>
                    <button class="btn save-btn confirm-ok-btn">${utils.getTranslation("common.confirm")}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.querySelector('.confirm-cancel-btn').addEventListener('click', close);
        modal.querySelector('.confirm-ok-btn').addEventListener('click', () => {
            close();
            onConfirm();
        });
        // 点击遮罩层取消
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
    },

    /**
     * 加载显示模式
     */
    loadDisplayMode() {
        const savedMode = localStorage.getItem('buttonDisplayMode');
        if (savedMode) {
            this.displayMode = savedMode;
        }
    },

    /**
     * 保存显示模式
     */
    saveDisplayMode() {
        localStorage.setItem('buttonDisplayMode', this.displayMode);
    },

    /**
     * 切换显示模式
     */
    toggleDisplayMode() {
        this.displayMode = this.displayMode === 'default' ? 'minimal' : 'default';
        this.saveDisplayMode();
        
        // 重新渲染首页按钮（应用新的布局）
        this.renderButtons();
        
        // 更新编辑页面的模式显示
        this.updateModeDisplay();
    },

    /**
     * 更新模式显示
     */
    updateModeDisplay() {
        
        // 每次都重新获取元素，确保元素存在
        const buttonsArea = document.getElementById('buttonsEditArea');
        const modeIndicator = document.getElementById('modeIndicator');
        const modeLabel = modeIndicator?.querySelector('.mode-label');
        const toggleModeBtn = document.getElementById('toggleMode');
        const toggleIcon = toggleModeBtn?.querySelector('i');


        if (!buttonsArea) {
            console.error('buttonsEditArea 元素未找到');
            return;
        }

        if (this.displayMode === 'minimal') {
            buttonsArea.classList.add('minimal-mode');
            if (modeLabel) modeLabel.textContent = '简约模式 - 首页每行2个按钮';
            if (toggleIcon) {
                toggleIcon.className = 'fas fa-list';
            }
        } else {
            buttonsArea.classList.remove('minimal-mode');
            if (modeLabel) modeLabel.textContent = '默认模式 - 首页每行1个按钮';
            if (toggleIcon) {
                toggleIcon.className = 'fas fa-th-large';
            }
        }
    }
};