// /src/modules/onboarding.js
// 新手引导模块
import { utils } from './utils.js';
import { profile } from './profile.js';
import { state } from './state.js';

const ONBOARDING_KEY = 'onboardingCompleted';
let elements = {};
let currentStep = 0;
let overlay = null;
let guideModal = null;

export const onboarding = {
    // 引导步骤配置
    steps: [
        {
            id: 'welcome',
            title: { zh: '👋 欢迎使用 Call Me', en: '👋 Welcome to Call Me', ja: '👋 Call Me へようこそ', ko: '👋 Call Me에 오신 것을 환영합니다' },
            content: { zh: '让我来帮你快速设置，了解如何使用这个应用', en: 'Let me help you set up and learn how to use this app', ja: 'セットアップと使い方を説明します', ko: '설정 및 사용 방법을 도와드리겠습니다' },
            highlight: null
        },
        {
            id: 'profile',
            title: { zh: '📝 第一步：设置你的资料', en: '📝 Step 1: Set Up Your Profile', ja: '📝 ステップ1：プロフィール設定', ko: '📝 1단계: 프로필 설정' },
            content: { zh: '点击左上角的"编辑资料"按钮，设置你的昵称和头像', en: 'Click "Edit Profile" in the top-left to set your nickname and avatar', ja: '左上の「プロフィール編集」をクリックして、ニックネームとアバターを設定', ko: '왼쪽 상단의 "프로필 수정"을 클릭하여 닉네임과 아바타를 설정하세요' },
            highlight: 'editProfile'
        },
        {
            id: 'buttons',
            title: { zh: '🎯 核心功能：通知按钮', en: '🎯 Core Feature: Notification Buttons', ja: '🎯 コア機能：通知ボタン', ko: '🎯 핵심 기능: 알림 버튼' },
            content: { zh: '点击中间的按钮发送通知，每个按钮代表不同的消息', en: 'Click the buttons in the center to send notifications, each button means a different message', ja: '中央のボタンをクリックして通知を送信、各ボタンは異なるメッセージを表します', ko: '가운데 버튼을 클릭하여 알림을 전송하세요. 각 버튼은 다른 메시지를 의미합니다' },
            highlight: 'bubbleContainer'
        },
        {
            id: 'edit-buttons',
            title: { zh: '⚙️ 自定义按钮', en: '⚙️ Customize Buttons', ja: '⚙️ ボタンカスタマイズ', ko: '⚙️ 버튼 사용자 정의' },
            content: { zh: '点击滑块图标可以编辑按钮文字和图标，添加自定义按钮', en: 'Click the sliders icon to edit button text and icons, add custom buttons', ja: 'スライダーアイコンをクリックしてボタンテキストとアイコンを編集、カスタムボタンを追加', ko: '슬라이더 아이콘을 클릭하여 버튼 텍스트와 아이콘을 편집하고 사용자 정의 버튼을 추가하세요' },
            highlight: 'editButtons'
        },
        {
            id: 'language',
            title: { zh: '🌍 多语言支持', en: '🌍 Multi-language Support', ja: '🌍 多言語サポート', ko: '🌍 다국어 지원' },
            content: { zh: '点击语言下拉菜单，切换到你喜欢的语言', en: 'Click the language dropdown to switch to your preferred language', ja: '言語ドロップダウンをクリックして、好みの言語に切り替え', ko: '언어 드롭다운을 클릭하여 선호하는 언어로 전환하세요' },
            highlight: 'languageToggle'
        },
        {
            id: 'history',
            title: { zh: '📜 查看历史记录', en: '📜 View History', ja: '📜 履歴を見る', ko: '📜 기록 보기' },
            content: { zh: '点击历史图标可以查看所有通知发送记录', en: 'Click the history icon to view all notification records', ja: '履歴アイコンをクリックして全ての通知記録を表示', ko: '기록 아이콘을 클릭하여 모든 알림 기록을 확인하세요' },
            highlight: null // 这个按钮是动态添加的
        },
        {
            id: 'cooldown',
            title: { zh: '⏱️ 冷却时间', en: '⏱️ Cooldown Time', ja: '⏱️ クールダウンタイム', ko: '⏱️ 쿨다운 시간' },
            content: { zh: '每次发送通知后有60秒冷却时间，防止频繁触发', en: 'There is a 60-second cooldown after each notification to prevent spam', ja: 'スパム防止のため、各通知後に60秒のクールダウンがあります', ko: '스팸 방지를 위해 각 알림 후 60초의 쿨다운이 있습니다' },
            highlight: 'countdown'
        },
        {
            id: 'complete',
            title: { zh: '🎉 准备就绪！', en: '🎉 You\'re Ready!', ja: '🎉 準備完了！', ko: '🎉 준비 완료!' },
            content: { zh: '现在你可以开始使用 Call Me 了！点击按钮发送通知吧', en: 'Now you can start using Call Me! Click buttons to send notifications', ja: 'これで Call Me を使い始められます！ボタンをクリックして通知を送信', ko: '이제 Call Me를 시작할 수 있습니다! 버튼을 클릭하여 알림을 전송하세요' },
            highlight: null
        }
    ],

    // 初始化
    init(domElements) {
        elements = domElements;
        this.checkAndStart();
    },

    // 检查是否需要显示引导
    checkAndStart() {
        const completed = localStorage.getItem(ONBOARDING_KEY);
        if (!completed) {
            // 延迟显示，确保页面已完全加载
            setTimeout(() => {
                this.showGuide();
            }, 1000);
        }
    },

    // 显示引导
    showGuide() {
        currentStep = 0;
        this.createOverlay();
        this.createGuideModal();
        this.renderStep();
    },

    // 创建遮罩层
    createOverlay() {
        overlay = document.createElement('div');
        overlay.className = 'onboarding-overlay';
        overlay.addEventListener('click', () => this.close());
        document.body.appendChild(overlay);
    },

    // 创建引导模态框
    createGuideModal() {
        guideModal = document.createElement('div');
        guideModal.className = 'onboarding-modal';
        guideModal.innerHTML = `
            <div class="onboarding-content">
                <div class="onboarding-header">
                    <h2 id="onboardingTitle"></h2>
                </div>
                <div class="onboarding-body">
                    <p id="onboardingContent"></p>
                </div>
                <div class="onboarding-footer">
                    <div class="onboarding-dots" id="onboardingDots"></div>
                    <div class="onboarding-buttons">
                        <button id="onboardingSkip" class="onboarding-btn-secondary">跳过</button>
                        <button id="onboardingNext" class="onboarding-btn-primary">下一步</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(guideModal);

        // 绑定事件
        guideModal.querySelector('#onboardingSkip').addEventListener('click', () => this.close());
        guideModal.querySelector('#onboardingNext').addEventListener('click', () => this.nextStep());
    },

    // 渲染当前步骤
    renderStep() {
        const step = this.steps[currentStep];
        const lang = state.currentLang;

        // 更新标题和内容
        const titleEl = guideModal.querySelector('#onboardingTitle');
        const contentEl = guideModal.querySelector('#onboardingContent');
        titleEl.textContent = step.title[lang] || step.title['en'];
        contentEl.textContent = step.content[lang] || step.content['en'];

        // 更新按钮文本
        const skipBtn = guideModal.querySelector('#onboardingSkip');
        const nextBtn = guideModal.querySelector('#onboardingNext');
        
        if (currentStep === this.steps.length - 1) {
            skipBtn.textContent = utils.getTranslation('onboarding.skip') || '跳过';
            nextBtn.textContent = utils.getTranslation('onboarding.start') || '开始使用';
        } else {
            skipBtn.textContent = utils.getTranslation('onboarding.skip') || '跳过';
            nextBtn.textContent = utils.getTranslation('onboarding.next') || '下一步';
        }

        // 更新指示点
        this.renderDots();

        // 高亮当前元素
        this.highlightElement(step.highlight);
    },

    // 渲染指示点
    renderDots() {
        const dotsContainer = guideModal.querySelector('#onboardingDots');
        dotsContainer.innerHTML = '';
        
        this.steps.forEach((_, index) => {
            const dot = document.createElement('span');
            dot.className = `onboarding-dot ${index === currentStep ? 'active' : ''}`;
            dotsContainer.appendChild(dot);
        });
    },

    // 高亮元素
    highlightElement(elementId) {
        // 清除之前的高亮
        document.querySelectorAll('.onboarding-highlight').forEach(el => {
            el.classList.remove('onboarding-highlight');
        });

        if (!elementId) return;

        let targetElement = null;
        
        // 特殊处理动态添加的历史按钮
        if (elementId === 'history') {
            targetElement = document.querySelector('.fa-history')?.parentElement;
        } else {
            targetElement = elements[elementId] || document.getElementById(elementId);
        }

        if (targetElement) {
            targetElement.classList.add('onboarding-highlight');
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    // 下一步
    nextStep() {
        if (currentStep < this.steps.length - 1) {
            currentStep++;
            this.renderStep();
        } else {
            this.complete();
        }
    },

    // 完成引导
    complete() {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        this.close();
    },

    // 关闭引导
    close() {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
        if (guideModal) {
            guideModal.remove();
            guideModal = null;
        }
        // 清除高亮
        document.querySelectorAll('.onboarding-highlight').forEach(el => {
            el.classList.remove('onboarding-highlight');
        });
    },

    // 重置引导（用于测试）
    reset() {
        localStorage.removeItem(ONBOARDING_KEY);
    }
};
