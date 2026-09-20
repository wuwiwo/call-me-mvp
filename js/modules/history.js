// history.js - 修改后的完整代码
// /src/modules/history.js
import { utils } from './utils.js';
import { readJsonSafe } from './state.js';
import { language } from './language.js';
import { theme } from './theme.js';

// 历史记录只允许两种既有状态。
// `_status` 来自 LocalStorage，属于可控输入：未知或缺失一律不产生状态 class，
// 以免任意字符串经由模板字符串突破 class 属性。
const HISTORY_STATUSES = new Set(['success', 'error']);

// 安全的历史状态取值：非法值返回空串（不产生状态 class）。
function safeStatus(status) {
    return HISTORY_STATUSES.has(status) ? status : '';
}

// 历史记录管理
export const history = {
    // DOM元素
    elements: null,

    // 初始化
    init(domElements) {
        // 检查是否提供了必要的DOM元素
        if (!domElements.list || !domElements.backBtn || !domElements.clearBtn) {
            console.error('历史记录模块初始化失败：缺少必要的DOM元素');
            return false;
        }

        this.elements = domElements;

        // 主题：历史页只加载本模块，没有 main.js，主题 init 要在这里补一次。
        // 与首页共用 <head> 防闪脚本 + theme.init()，保证两页 data-theme 一致。
        theme.init();

        // 复用首页的语言初始化与回退规则：读取 appLanguage → 校验是否受支持
        // → 落到 state.currentLang。历史页没有语言切换控件，不传元素即可
        // （language.init 对缺失元素一律跳过，不会访问不存在的 DOM）。
        language.init();
        this.applyPageTexts();

        this.bindEvents();
        this.render();
        return true;
    },

    /**
     * 把当前语言应用到历史页的静态文案。
     *
     * 覆盖：文档标题、顶部标题、返回按钮 title、清除按钮 title。
     * 空状态与错误 Webhook 标签在 render() 内应用，清除反馈在 clear() 内应用。
     *
     * 查表统一走 utils.getTranslation（读的就是首页那份 state.currentLang），
     * 只写本页元素，元素缺失时跳过，不产生第二份语言状态、也不触碰首页文案。
     */
    applyPageTexts() {
        const t = (key) => utils.getTranslation(key);

        document.title = t('history.pageTitle');

        const topTitleEl = this.elements.topTitleEl;
        if (topTitleEl) topTitleEl.textContent = t('history.pageTitle');

        if (this.elements.backBtn) {
            this.elements.backBtn.title = t('history.backTitle');
        }
        if (this.elements.clearBtn) {
            this.elements.clearBtn.title = t('history.clearTitle');
        }
    },

    // 绑定事件
    bindEvents() {
        this.elements.clearBtn.addEventListener('click', () => this.clear());
        this.elements.backBtn.addEventListener('click', () => window.history.back());
    },

    // 渲染历史记录
    //
    // 两个页面共用：history.html 走无参的 render()（渲染到 init 传入的列表），
    // 首页内嵌视图走 renderList(外部列表节点)。
    render() {
        this.renderList(this.elements?.list);
    },

    /**
     * 把历史渲染到指定列表节点。
     *
     * 记录内容（nickname / emoji / message / webhook）与 `_status` 都来自
     * LocalStorage，属于可控输入，必须作为**文本**进入页面：
     * 全部用 createElement + textContent 构建 DOM，不用模板字符串拼 HTML。
     * 这样恶意字符串 `<img onerror=...>` 只会显示成字面文本，
     * 不会产生新元素、新属性，也不会执行脚本。
     *
     * @param {HTMLElement|null} list 目标列表容器；缺失时静默跳过
     */
    renderList(list) {
        if (!list) return;

        // 损坏或类型错误时回退为空数组，历史页仍可加载并显示空状态
        const records = readJsonSafe('notificationHistory', [], (v) => Array.isArray(v));

        list.textContent = '';

        if (records.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = utils.getTranslation('history.empty');
            list.appendChild(empty);
            return;
        }

        records.forEach((record) => {
            const item = record && typeof record === 'object' ? record : {};
            const status = safeStatus(item._status);

            const itemEl = document.createElement('div');
            itemEl.className = status ? `history-item ${status}` : 'history-item';

            const emojiEl = document.createElement('div');
            emojiEl.className = 'history-emoji';
            emojiEl.textContent = item.emoji ?? '';

            const contentEl = document.createElement('div');
            contentEl.className = 'history-content';

            const headerEl = document.createElement('div');
            headerEl.className = 'history-header';

            const nameEl = document.createElement('span');
            nameEl.className = 'history-name';
            nameEl.textContent = item.nickname ?? '';

            const timeEl = document.createElement('span');
            timeEl.className = 'history-time';
            timeEl.textContent = utils.formatTime(item.timestamp);

            headerEl.appendChild(nameEl);
            headerEl.appendChild(timeEl);

            const messageEl = document.createElement('div');
            messageEl.className = 'history-message';
            messageEl.textContent = item.message ?? '';

            contentEl.appendChild(headerEl);
            contentEl.appendChild(messageEl);

            if (status === 'error') {
                const errorEl = document.createElement('div');
                errorEl.className = 'history-error';
                // 标签跟随当前语言；URL 本身是用户数据，仍按纯文本写入
                errorEl.textContent = `${utils.getTranslation('history.webhookLabel')}: ${item.webhook ?? ''}`;
                contentEl.appendChild(errorEl);
            }

            itemEl.appendChild(emojiEl);
            itemEl.appendChild(contentEl);
            list.appendChild(itemEl);
        });
    },

    /**
     * 清除历史记录。
     *
     * @param {HTMLElement} [listEl] 需要重绘的列表；不传则重绘 init 时的列表。
     * 首页内嵌视图会传自己的列表节点进来。
     */
    clear(listEl) {
        localStorage.removeItem('notificationHistory');
        this.renderList(listEl || this.elements?.list);

        // 显示清除成功的反馈（文案跟随当前语言）
        const toast = document.createElement('div');
        toast.className = 'history-toast';
        toast.textContent = utils.getTranslation('history.cleared');
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
};
