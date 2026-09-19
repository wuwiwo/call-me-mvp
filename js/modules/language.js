// /src/modules/language.js
import { TRANSLATIONS } from './translations.js';
import { state } from './state.js';

// 多语言管理
export const language = {
    // DOM元素缓存
    elements: null,
    
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
    bindEvents() {
        // 语言切换按钮事件
        if (this.elements.languageToggle) {
            this.elements.languageToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleLanguageMenu();
            });
        }
        
        // 语言选项点击事件
        if (this.elements.languageMenu) {
            this.elements.languageMenu.addEventListener('click', (e) => {
                const option = e.target.closest('.language-option');
                if (option) {
                    const lang = option.dataset.lang;
                    this.update(lang);
                    this.hideLanguageMenu();
                }
            });
        }
        
        // 点击外部关闭菜单
        document.addEventListener('click', () => {
            this.hideLanguageMenu();
        });
        
        // 阻止菜单内部点击事件冒泡
        if (this.elements.languageMenu) {
            this.elements.languageMenu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    },
    
    // 切换语言菜单显示/隐藏
    //
    // 以下三个方法都对元素做存在性判断：历史页没有语言切换控件，
    // 但 bindEvents() 会注册一个全局 click 监听去调用 hideLanguageMenu()，
    // 若不判断，在历史页上任意点击都会抛 TypeError。
    toggleLanguageMenu() {
        const menu = this.elements?.languageMenu;
        if (!menu) return;

        if (menu.classList.contains('show')) {
            this.hideLanguageMenu();
        } else {
            this.showLanguageMenu();
        }
    },
    
    // 显示语言菜单
    showLanguageMenu() {
        const menu = this.elements?.languageMenu;
        const toggle = this.elements?.languageToggle;
        if (!menu || !toggle) return;
        
        menu.classList.add('show');
        toggle.classList.add('active');
        
        // 添加背景遮罩
        this.addBackdrop();
    },
    
    // 隐藏语言菜单
    hideLanguageMenu() {
        const menu = this.elements?.languageMenu;
        const toggle = this.elements?.languageToggle;
        
        menu?.classList.remove('show');
        toggle?.classList.remove('active');
        
        // 移除背景遮罩
        this.removeBackdrop();
    },
    
    // 添加背景遮罩
    addBackdrop() {
        if (!document.getElementById('languageDropdownBackdrop')) {
            const backdrop = document.createElement('div');
            backdrop.id = 'languageDropdownBackdrop';
            backdrop.className = 'language-dropdown-backdrop';
            backdrop.addEventListener('click', () => this.hideLanguageMenu());
            document.body.appendChild(backdrop);
        }
    },
    
    // 移除背景遮罩
    removeBackdrop() {
        const backdrop = document.getElementById('languageDropdownBackdrop');
        if (backdrop) {
            backdrop.remove();
        }
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
        this.hideLanguageMenu();
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
    },
    
    // 更新语言选项状态
    updateLanguageOptions(lang) {
        const options = this.elements.languageMenu?.querySelectorAll('.language-option') || [];
        
        options.forEach(option => {
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
        const icons = ["bolt", "shield-alt", "exclamation-triangle", "gift"];
        return icons[index] || "circle";
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