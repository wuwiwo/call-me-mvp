// /src/modules/language.js
import { TRANSLATIONS } from './translations.js';
import { state } from './state.js';
import { utils } from './utils.js';
import { createPopupMenu } from '../components/popupMenu.js';

// 多语言管理
export const language = {
    // DOM元素缓存
    elements: null,

    // 语言下拉菜单的组件实例（历史页没有切换控件 → 保持 null）
    menu: null,

    // 语言显示映射
    languageDisplayMap: {
        zh: { display: '中', name: '中文', flag: '🇨🇳' },
        en: { display: 'EN', name: 'English', flag: '🇺🇸' },
        ja: { display: 'JA', name: '日本語', flag: '🇯🇵' },
        ko: { display: 'KO', name: '한국어', flag: '🇰🇷' }
    },

    /**
     * 初始化语言。
     *
     * `domElements` 允许只包含当前页面存在的元素（也可以是空对象）：
     * 首页有语言切换控件，历史页只有静态文案、没有切换控件。
     * 所有元素访问都做了存在性判断，因此**同一个初始化入口可以跨页面复用**，
     * 不需要为历史页再写一份语言状态或回退规则。
     */
    init(domElements = {}) {
        this.elements = domElements || {};

        // 读取并校验 appLanguage（缺失/不支持时回退），落到 state.currentLang
        this.loadSavedLanguage();
        this.bindEvents();
        this.updateUI();
    },

    // 加载保存的语言设置
    loadSavedLanguage() {
        const savedLang = localStorage.getItem('appLanguage');
        if (savedLang && TRANSLATIONS[savedLang]) {
            state.currentLang = savedLang;
        } else {
            // 浏览器语言检测
            const browserLang = navigator.language.split('-')[0];
            const supportedLangs = ['zh', 'en', 'ja', 'ko'];
            state.currentLang = supportedLangs.includes(browserLang) ? browserLang : 'zh';
        }
    },

    // 绑定语言切换事件
    //
    // 下拉的开合交给 popupMenu 组件（与 ⋯ 更多菜单同一套实现）：
    // 本模块只注入"选中某项 = 切换语言"这一条语义，以及"哪一项是当前语言"。
    // 历史页没有切换控件 → 不创建组件，也就不注册任何监听。
    bindEvents() {
        const toggle = this.elements.languageToggle;
        const panel = this.elements.languageMenu;
        if (!toggle || !panel) return;

        this.menu = createPopupMenu({
            toggle,
            panel,
            // 语言下拉的遮罩是运行时创建/销毁的（与 ⋯ 菜单的预埋节点不同），
            // 形态差异由配置项表达，不强行统一 —— 各自的 class 已被样式钉住。
            createBackdrop: {
                id: 'languageDropdownBackdrop',
                className: 'language-dropdown-backdrop'
            },
            itemSelector: '.language-option',
            onSelect: (target) => {
                const option = target.closest('.language-option');
                if (!option) return;
                this.update(option.dataset.lang);
            },
            onSync: () => this.updateLanguageOptions(state.currentLang)
        });

        this.menu.render();
    },

    // 更新界面语言
    update(lang) {
        if (!TRANSLATIONS[lang]) {
            console.warn(`不支持的语言: ${lang}, 使用默认语言zh`);
            lang = 'zh';
        }

        state.currentLang = lang;

        // 保存到localStorage实现持久化
        localStorage.setItem('appLanguage', lang);

        // 更新界面
        this.updateUI();

        // 隐藏菜单
        this.menu?.close();
    },

    // 更新界面元素
    updateUI() {
        const lang = state.currentLang;
        // currentLang 非法时回退中文：避免读取 undefined 的属性而中断页面
        const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
        const langInfo = this.languageDisplayMap[lang] || this.languageDisplayMap.zh;

        // 更新当前语言显示
        if (this.elements?.currentLanguage) {
            this.elements.currentLanguage.textContent = langInfo.display;
        }

        // 更新标题和副标题
        if (this.elements?.titleEl && t.common.title) {
            this.elements.titleEl.textContent = t.common.title;
        }

        if (this.elements?.subtitleEl && t.mainPage.subtitle) {
            this.elements.subtitleEl.textContent = t.mainPage.subtitle;
        }

        // 更新语言选项状态
        this.updateLanguageOptions(lang);

        // 更新用户信息
        this.updateUserInfo();

        // 更新声明式文案：任何元素只要写上 data-i18n="a.b"（文本）
        // 或 data-i18n-title="a.b"（title 属性），就会在这里统一填充。
        // ⋯ 菜单项、主题名、历史入口等都走这条通道 ——
        // 新增静态文案不需要再给 language 加字段。
        this.applyDeclarativeTexts();
    },

    // 填充 [data-i18n] / [data-i18n-title] 声明的文案
    applyDeclarativeTexts() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const value = utils.getTranslation(el.dataset.i18n);
            if (typeof value === 'string') {
                el.textContent = value;
            }
        });

        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const value = utils.getTranslation(el.dataset.i18nTitle);
            if (typeof value === 'string') {
                el.title = value;
            }
        });
    },

    // 更新语言选项状态
    updateLanguageOptions(lang) {
        const options = this.elements.languageMenu?.querySelectorAll('.language-option') || [];

        options.forEach((option) => {
            const optionLang = option.dataset.lang;
            if (optionLang === lang) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    },

    // 更新用户信息
    //
    // 历史页没有用户信息元素（userNameEl），整段跳过；
    // 首页传入该元素时行为与之前完全一致。
    updateUserInfo() {
        const el = this.elements?.userNameEl;
        if (!el) return;

        const t = TRANSLATIONS[state.currentLang] || TRANSLATIONS.zh;
        el.textContent =
            state.userProfile && state.userProfile.nickname
                ? state.userProfile.nickname
                : t.common.unregistered;
    },

    // 获取气泡按钮图标
    getBubbleIcon(index) {
        const icons = ['bolt', 'shield-alt', 'exclamation-triangle', 'gift'];
        return icons[index] || 'circle';
    },

    // 获取当前语言
    getCurrentLanguage() {
        return state.currentLang || 'zh';
    },

    // 获取支持的语言列表
    getSupportedLanguages() {
        return Object.keys(TRANSLATIONS);
    },

    // 获取语言显示信息
    getLanguageDisplayInfo(lang) {
        return this.languageDisplayMap[lang] || this.languageDisplayMap.zh;
    }
};
