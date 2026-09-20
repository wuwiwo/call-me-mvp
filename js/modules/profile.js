// /src/modules/profile.js
import { utils } from './utils.js';
import { state } from './state.js';
import { notification } from './notification.js';
import { createModal } from '../components/modal.js';

// 用户资料管理
export const profile = {
    elements: null,
    selectedEmoji: null,

    // 资料模态框组件实例（开关与"点遮罩/关闭按钮关闭"由组件统一处理）
    modal: null,

    // 初始化方法
    init(domElements) {
        this.elements = domElements;
        if (!this.elements.editProfileBtn) {
            console.error('编辑资料按钮未找到');
            return;
        }

        // 接上模态框：节点预埋在 html，组件只接管开关
        if (this.elements.profileModal) {
            this.modal = createModal(this.elements.profileModal);
            this.modal.render();
        }
        // 初始化选中的头像
        if (this.elements.emojiOptions?.length > 0) {
            this.selectedEmoji = this.elements.emojiOptions[0].dataset.emoji;
        }
        this.elements.editProfileBtn.addEventListener('click', () => {
            this.showModal(false);
        });

        this.bindEvents();
    },

    // 绑定事件
    bindEvents() {
        // 绑定头像选择事件
        if (this.elements.emojiOptions) {
            this.elements.emojiOptions.forEach((option) => {
                option.addEventListener('click', (e) => {
                    // 移除所有active类
                    this.elements.emojiOptions.forEach((opt) => opt.classList.remove('active'));

                    // 给当前选项添加active类
                    e.currentTarget.classList.add('active');

                    // 更新选中的emoji
                    this.selectedEmoji = e.currentTarget.dataset.emoji;
                });
            });
        }

        if (this.elements.editProfileBtn) {
            this.elements.editProfileBtn.addEventListener('click', () => {
                this.showModal(false);
            });
        } else {
            console.error('编辑资料按钮未找到');
        }

        if (this.elements.saveProfileBtn) {
            this.elements.saveProfileBtn.addEventListener('click', () => this.save());
        }
    },
    //关闭模块框
    closeModal() {
        this.modal?.close();
    },

    // 显示模态框
    showModal(isNewUser = false) {
        if (this.elements.emojiOptions && state.userProfile?.emoji) {
            this.elements.emojiOptions.forEach((opt) => {
                opt.classList.toggle('active', opt.dataset.emoji === state.userProfile.emoji);
            });
            this.selectedEmoji = state.userProfile.emoji;
        }

        if (!this.elements.profileModal) {
            console.error('资料模态框未找到');
            return;
        }

        this.elements.modalTitle.textContent = utils.getTranslation(
            `profile.${isNewUser ? 'bindTitle' : 'editTitle'}`
        );

        this.elements.nicknameInput.value = state.userProfile?.nickname || '';
        this.modal?.open();
    },

    // 保存资料
    save() {
        if (!this.selectedEmoji) {
            console.error('没有选中的头像');
            return;
        }

        const nickname = this.elements.nicknameInput.value.trim();
        if (!nickname) {
            notification.show(utils.getTranslation('profile.nicknamePlaceholder'), false);
            return;
        }

        state.userProfile = {
            nickname,
            emoji: this.selectedEmoji // 使用当前选中的emoji
        };

        localStorage.setItem('userProfile', JSON.stringify(state.userProfile));
        this.modal?.close();
        this.loadProfile(); // 刷新显示
    },

    // 加载资料
    loadProfile() {
        if (!state.userProfile) return;

        if (this.elements.userNameEl) {
            this.elements.userNameEl.textContent = state.userProfile.nickname;
        }

        if (this.elements.userAvatarEl) {
            this.elements.userAvatarEl.textContent = state.userProfile.emoji;
        }
    }
};
