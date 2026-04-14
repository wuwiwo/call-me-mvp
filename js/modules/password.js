// /src/modules/password.js
// 密码验证模块（简单访问控制）
import { utils } from './utils.js';
import { state } from './state.js';

const PASSWORD_KEY = 'accessPassword';
const PASSWORD_TIMESTAMP_KEY = 'passwordSetTime';
const PASSWORD_EXPIRY_DAYS = 7; // 7天过期

export const password = {
    elements: null,
    correctPassword: '666888', 
    // 初始化
    init(domElements) {
        this.elements = domElements;
        
        // 检查密码是否过期
        if (this.isPasswordExpired()) {
            this.showPasswordModal();
        }
    },

    // 检查密码是否过期
    isPasswordExpired() {
        const setTime = localStorage.getItem(PASSWORD_TIMESTAMP_KEY);
        
        // 如果没有设置时间，说明从未设置过密码
        if (!setTime) {
            return true;
        }

        const now = Date.now();
        const setTimeParsed = parseInt(setTime);
        const expiryTime = PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // 7天的毫秒数
        
        return (now - setTimeParsed) > expiryTime;
    },

    // 显示密码输入模态框
    showPasswordModal() {
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'modal show password-modal';
        modal.id = 'passwordModal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${utils.getTranslation('password.title') || '🔐 访问验证'}</h2>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="passwordInput">${utils.getTranslation('password.label') || '请输入访问密码'}</label>
                        <input 
                            type="password" 
                            id="passwordInput" 
                            placeholder="${utils.getTranslation('password.placeholder') || '输入密码'}"
                            maxlength="20"
                            autofocus
                        />
                        <div id="passwordError" class="password-error" style="display: none;"></div>
                    </div>
                    <div class="password-hint">
                        <i class="fas fa-info-circle"></i>
                        <span>${utils.getTranslation('password.hint') || '提示：密码每周更新，请联系管理员获取最新密码'}</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="verifyPassword" class="btn save-btn">
                        ${utils.getTranslation('password.verifyBtn') || '验证'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定事件
        const input = modal.querySelector('#passwordInput');
        const verifyBtn = modal.querySelector('#verifyPassword');
        const errorDiv = modal.querySelector('#passwordError');

        // 点击验证按钮
        verifyBtn.addEventListener('click', () => {
            const password = input.value.trim();
            if (!password) {
                this.showError(errorDiv, utils.getTranslation('password.errorEmpty') || '请输入密码');
                return;
            }

            if (this.verify(password)) {
                modal.remove();
                this.onSuccess();
            } else {
                this.showError(errorDiv, utils.getTranslation('password.errorWrong') || '密码错误，请重试');
                input.value = '';
                input.focus();
            }
        });

        // 回车键验证
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                verifyBtn.click();
            }
        });

        // 点击模态框外部不关闭（强制验证）
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                // 不允许通过点击外部关闭
                input.focus();
            }
        });
    },

    // 验证密码
    verify(inputPassword) {
        // 获取当前密码（可能是默认密码或用户设置的密码）
        const storedPassword = localStorage.getItem(PASSWORD_KEY) || this.correctPassword;
        return inputPassword === storedPassword;
    },

    // 验证成功回调
    onSuccess() {
        // 记录密码设置时间
        localStorage.setItem(PASSWORD_TIMESTAMP_KEY, Date.now().toString());
        console.log('密码验证成功');
    },

    // 显示错误信息
    showError(errorDiv, message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        // 3秒后自动隐藏
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 3000);
    },

    // 设置新密码（如果需要修改密码功能）
    setPassword(newPassword) {
        localStorage.setItem(PASSWORD_KEY, newPassword);
        localStorage.setItem(PASSWORD_TIMESTAMP_KEY, Date.now().toString());
    },

    // 清除密码设置（用于重置）
    clearPassword() {
        localStorage.removeItem(PASSWORD_KEY);
        localStorage.removeItem(PASSWORD_TIMESTAMP_KEY);
    },

    // 获取剩余天数
    getRemainingDays() {
        const setTime = localStorage.getItem(PASSWORD_TIMESTAMP_KEY);
        if (!setTime) return 0;

        const now = Date.now();
        const setTimeParsed = parseInt(setTime);
        const expiryTime = PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        const remaining = expiryTime - (now - setTimeParsed);

        return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
    }
};
