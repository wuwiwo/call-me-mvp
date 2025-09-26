// /src/modules/profile.js
import { CONFIG } from './config.js';
import { utils } from './utils.js';
import { state } from './state.js';

// DOM元素缓存
let elements = {};

// 用户资料管理
export const profile = {
    elements: null,
    selectedEmoji: null,
    
    // 初始化方法
    init(domElements) {
        this.elements = domElements;
        console.log('Profile模块初始化，元素:', this.elements);
        if (!this.elements.editProfileBtn) {
            console.error('编辑资料按钮未找到');
            return;
        }
        // 初始化选中的头像
        if (this.elements.emojiOptions?.length > 0) {
            this.selectedEmoji = this.elements.emojiOptions[0].dataset.emoji;
        }
        this.elements.editProfileBtn.addEventListener('click', () => {
            console.log('编辑资料按钮被点击');
            this.showModal(false);
        });
        
        this.bindEvents();
    },
    
    // 绑定事件
    bindEvents() {
      
      // 绑定头像选择事件
        if (this.elements.emojiOptions) {
            this.elements.emojiOptions.forEach(option => {
                option.addEventListener('click', (e) => {
                    // 移除所有active类
                    this.elements.emojiOptions.forEach(opt => 
                        opt.classList.remove('active'));
                    
                    // 给当前选项添加active类
                    e.currentTarget.classList.add('active');
                    
                    // 更新选中的emoji
                    this.selectedEmoji = e.currentTarget.dataset.emoji;
                    console.log('选中头像:', this.selectedEmoji);  // 调试用
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
        
        if (this.elements.profileModal) {
            this.elements.profileModal.addEventListener('click', (e) => {
                // 点击关闭按钮
                if (e.target.classList.contains('close-btn')) {
                    this.closeModal();
                }
                // 点击模态框外部
                else if (e.target === this.elements.profileModal) {
                    this.closeModal();
                }
            });
        }
    },
    //关闭模块框
    closeModal() {
        console.log('关闭模态框');
if (this.elements.profileModal) {
            this.elements.profileModal.classList.remove('show');
        }
    },
    
    // 显示模态框
    showModal(isNewUser = false) {
      
      if (this.elements.emojiOptions && state.userProfile?.emoji) {
            this.elements.emojiOptions.forEach(opt => {
                opt.classList.toggle(
                    'active', 
                    opt.dataset.emoji === state.userProfile.emoji
                );
            });
            this.selectedEmoji = state.userProfile.emoji;
        }
      
        if (!this.elements.profileModal) {
            console.error('资料模态框未找到');
            return;
        }
        
        this.elements.modalTitle.textContent = utils.getTranslation(
            `profile.${isNewUser ? "bindTitle" : "editTitle"}`
        );
        
        this.elements.nicknameInput.value = state.userProfile?.nickname || "";
        this.elements.profileModal.classList.add('show');
    },
    
    // 保存资料
    save() {
        if (!this.selectedEmoji) {
            console.error('没有选中的头像');
            return;
        }

        const nickname = this.elements.nicknameInput.value.trim();
        if (!nickname) {
            notification.show(utils.getTranslation("profile.nicknamePlaceholder"), false);
            return;
        }

        state.userProfile = {
            nickname,
            emoji: this.selectedEmoji  // 使用当前选中的emoji
        };

        localStorage.setItem("userProfile", JSON.stringify(state.userProfile));
        this.elements.profileModal.classList.remove('show');
        this.loadProfile();  // 刷新显示
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