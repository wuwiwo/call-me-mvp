// /src/components/iconPicker.js
//
// 图标选择器组件（预览触发器 + 弹出网格）。
//
// 抽它的直接原因：它是一段**与按钮业务无关**的纯 UI —— 造结构、渲染选项、
// 处理开合与选中。原先整段（约 200 行）嵌在 buttonManager 里，
// 让"按钮配置管理"这个主题里混进了一个完整的下拉控件实现。
// 抽出来之后 buttonManager 只负责"给选择器什么值、取回什么值"。
//
// 关于安全：图标值来自 LocalStorage，会被拼进 `class="fas fa-<name>"`。
// 本组件**不自己决定**哪些值合法 —— 白名单由调用方通过 `allowed` 传入，
// 组件只做闭集判断（列表外一律回退）。这样"哪些图标可用"仍然只有一个来源。
//
// 关于"显示值"与"存储值"的分离：
//   - `data-value` 存**原始值**（可能不在白名单内），保存时原样回写，
//     于是"打开编辑 → 不碰图标 → 保存"不会静默改写用户数据；
//   - 预览与 class 只使用白名单内的值。
// 这两件事由 `resolveIconName` 统一处理，首页按钮渲染也复用同一个函数，
// 避免出现"按钮显示某图标、打开编辑却预选另一项"。
import { defineComponent } from './component.js';

// "随机"在界面上用一个专用字形表示，它是**表现层常量**，不是一个可存储的图标值。
const RANDOM_GLYPH = 'shuffle';

/**
 * 白名单闭集判定：只放行 `allowed` 内的值，列表外一律回退。
 *
 * 刻意不用"安全字符集正则"兜底 —— 正则挡得住引号空格，挡不住任意合法 token
 * 被当作图标渲染，那会让 class 的内容由**数据**而不是由**配置**决定。
 *
 * @param {*} name 待判定的图标名
 * @param {Set<string>} allowed 允许列表
 * @param {string} fallback 回退值
 * @returns {string} 一定属于 allowed（或就是 fallback）的名字
 */
export function resolveIconName(name, allowed, fallback) {
    return typeof name === 'string' && allowed.has(name) ? name : fallback;
}

/**
 * 创建图标选择器。
 *
 * @param {Object} options
 * @param {string[]} options.icons 可选图标名（顺序即展示顺序）
 * @param {Set<string>} options.allowed 允许列表（决定哪些值能变成 class）
 * @param {string} options.fallback 白名单外的回退值
 * @param {string} [options.selected] 当前值（原值，可能不在白名单内）
 * @param {string} [options.id] 选择器节点 id
 * @param {Function} [options.labels] `(iconName) => 显示名`
 * @param {string} [options.randomLabel] "随机"选项的显示名
 * @param {string} [options.randomValue='random'] "随机"选项对应的存储值
 * @returns {Object} 组件实例（`el` 是 `.icon-picker` 节点）
 */
export function createIconPicker(options = {}) {
    const {
        icons = [],
        allowed = new Set(),
        fallback = 'random',
        selected = '',
        id = '',
        labels = (name) => name,
        randomLabel = '',
        randomValue = 'random'
    } = options;

    // 字形允许列表 = 图标白名单 + 表现层常量
    const glyphs = new Set([...allowed, RANDOM_GLYPH]);

    const picker = defineComponent({
        icons,
        allowed,
        fallback,
        randomLabel,
        randomValue,
        labels,
        glyphs,
        id,

        /** 当前存储值（原值优先） */
        value: '',

        mount() {
            this.value = typeof selected === 'string' && selected ? selected : this.fallback;
            this.el = this.build();
        },

        /** 重建节点并同步显示（value 变化后调用）。节点尚未入 DOM 时只替换引用 */
        update() {
            if (!this.el) return;
            const next = this.build();
            if (this.el.parentNode) this.el.replaceWith(next);
            this.el = next;
        },

        /** @returns {HTMLElement} `.icon-picker` 节点 */
        build() {
            const root = document.createElement('div');
            root.className = 'icon-picker';
            root.dataset.value = this.value;
            if (this.id) root.id = this.id;

            // 预览与 class 只用白名单内的值；"随机"用专用字形
            const current = resolveIconName(this.value, this.allowed, this.fallback);
            const previewName = current === this.randomValue ? RANDOM_GLYPH : current;
            const previewLabel =
                current === this.randomValue ? this.randomLabel : this.labels(current);

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'icon-picker-trigger';

            const triggerIcon = document.createElement('i');
            triggerIcon.className = `fas fa-${this.glyph(previewName)}`;

            const triggerLabel = document.createElement('span');
            triggerLabel.className = 'icon-picker-label';
            triggerLabel.textContent = previewLabel;

            const caret = document.createElement('i');
            caret.className = 'fas fa-chevron-down icon-picker-caret';

            trigger.appendChild(triggerIcon);
            trigger.appendChild(triggerLabel);
            trigger.appendChild(caret);

            const menu = document.createElement('div');
            menu.className = 'icon-picker-menu';
            menu.appendChild(
                this.buildOption(this.randomValue, RANDOM_GLYPH, this.randomLabel, this.value)
            );
            this.icons.forEach((icon) => {
                menu.appendChild(this.buildOption(icon, icon, this.labels(icon), this.value));
            });

            root.appendChild(trigger);
            root.appendChild(menu);
            return root;
        },

        /** 字形名同样走闭集：列表外一律回退到随机字形 */
        glyph(name) {
            return this.glyphs.has(name) ? name : RANDOM_GLYPH;
        },

        buildOption(value, glyphName, label, currentValue) {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'icon-picker-option' + (value === currentValue ? ' selected' : '');
            option.dataset.value = value;

            const icon = document.createElement('i');
            icon.className = `fas fa-${this.glyph(glyphName)}`;

            const text = document.createElement('span');
            text.textContent = label;

            option.appendChild(icon);
            option.appendChild(text);
            return option;
        },

        /** @returns {string} 当前存储值（用于保存回写） */
        getValue() {
            return this.el?.dataset.value ?? this.value;
        },

        /**
         * 赋新值（选中某个选项后由事件委托调用）。
         *
         * @param {string} value 存储值
         */
        setValue(value) {
            if (typeof value !== 'string' || value === this.value) return;
            this.value = value;
            this.update();
        }
    });

    return picker;
}

/**
 * 在一个根容器上绑定图标选择器的事件委托。
 *
 * 委托而不是逐个实例绑定：编辑表单每次打开都会重建，逐个绑定意味着每次
 * 都要先解绑旧的。委托一次，重建后的节点自动生效。
 *
 * @param {HTMLElement} root 委托根（按钮编辑模态框）
 */
export function bindIconPickerDelegation(root) {
    if (!root || root.dataset.iconPickerBound) return;
    root.dataset.iconPickerBound = '1';

    const closeAllExcept = (keepPicker) => {
        root.querySelectorAll('.icon-picker.open').forEach((p) => {
            if (p === keepPicker) return;
            p.classList.remove('open');
            p.querySelector('.icon-picker-menu')?.classList.remove('show');
        });
    };

    root.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        // 点触发器：开合菜单（同时关掉其他已打开的）
        const trigger = target.closest('.icon-picker-trigger');
        if (trigger) {
            const pickerEl = trigger.closest('.icon-picker');
            const menu = pickerEl?.querySelector('.icon-picker-menu');
            if (!pickerEl || !menu) return;

            const isOpen = menu.classList.contains('show');
            closeAllExcept(pickerEl);
            menu.classList.toggle('show', !isOpen);
            pickerEl.classList.toggle('open', !isOpen);
            return;
        }

        // 点选项：选中并关闭
        const option = target.closest('.icon-picker-option');
        if (option) {
            const pickerEl = option.closest('.icon-picker');
            if (!pickerEl) return;

            const value = option.dataset.value;
            const iconClass = option.querySelector('i')?.className;
            const label = option.querySelector('span')?.textContent;

            pickerEl.dataset.value = value;

            const triggerEl = pickerEl.querySelector('.icon-picker-trigger');
            const triggerIcon = triggerEl?.querySelector('i');
            const triggerLabel = triggerEl?.querySelector('.icon-picker-label');
            if (triggerIcon && iconClass) triggerIcon.className = iconClass;
            if (triggerLabel && typeof label === 'string') triggerLabel.textContent = label;

            pickerEl
                .querySelectorAll('.icon-picker-option')
                .forEach((o) => o.classList.toggle('selected', o === option));

            pickerEl.classList.remove('open');
            pickerEl.querySelector('.icon-picker-menu')?.classList.remove('show');
        }
    });

    // 点容器外关闭所有菜单
    document.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('.icon-picker')) return;
        closeAllExcept(null);
    });
}
