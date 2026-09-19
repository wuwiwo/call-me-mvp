// /src/modules/password.js
//
// 访问提示模块。
//
// ⚠️ 这是 **UI 级访问提示，不是安全边界**：密码与有效期都写在前端源码里，
// 任何能打开页面的人（读源码、开 DevTools、清 LocalStorage）都能绕过。
// 完整的资产 / 对手 / 结论见 `docs/SECURITY.md`。
// 因此本模块（及其文案）**不得**声称或暗示「保护 / 安全 / 加密 / 授权」。
import { utils } from './utils.js';
import { CONFIG } from './config.js';

// LocalStorage key：**名称与格式保持不变**（数据兼容），所以留在本模块。
const PASSWORD_KEY = 'accessPassword';
const PASSWORD_TIMESTAMP_KEY = 'passwordSetTime';

// 密码与有效期的**唯一来源是 `CONFIG.password`**（config.js）。
// 本模块不再各自硬编码一份：历史上 config.js 与本模块各存了一份默认密码
// 与过期天数，两处独立维护，改一处就会不一致。
// （此处刻意不写出历史字面量：验收要求 `grep 默认密码 js/` 只命中 config.js。）

/** 默认密码：取自唯一来源；配置缺失或类型不对时退化为空串（不抛异常，也不放行任意输入）。 */
function defaultPassword() {
    const v = CONFIG.password && CONFIG.password.defaultPassword;
    return typeof v === 'string' ? v : '';
}

/** 有效期（毫秒）：取自唯一来源；天数非法或 ≤ 0 时按 0 处理（即立即需要重新验证）。 */
function expiryMs() {
    const days = CONFIG.password ? Number(CONFIG.password.expiryDays) : NaN;
    const safeDays = Number.isFinite(days) && days > 0 ? days : 0;
    return safeDays * 24 * 60 * 60 * 1000;
}

export const password = {
    elements: null,

    // 初始化
    init(domElements) {
        this.elements = domElements;

        // 检查密码是否过期
        if (this.isPasswordExpired()) {
            this.showPasswordModal();
        }
    },

    // 检查是否需要重新验证（没有记录 / 已过期 / 记录损坏）
    //
    // 关于「记录损坏」：原实现直接用 `parseInt` 的结果参与比较，而
    // `Date.now() - NaN` 是 NaN、`NaN > x` 恒为 false ——
    // 也就是**时间戳损坏时反而永远不要求验证**。对一道闸门来说，
    // 坏数据应当倾向于要求验证，故显式把 NaN 判为「已过期」。
    isPasswordExpired() {
        const setTime = localStorage.getItem(PASSWORD_TIMESTAMP_KEY);

        // 没有记录（key 不存在，或值为空串）→ 视为从未验证过
        if (!setTime) {
            return true;
        }

        const setTimeParsed = parseInt(setTime, 10);

        // 时间戳损坏（非数字 / NaN / Infinity）→ 按「已过期」处理
        if (!Number.isFinite(setTimeParsed)) {
            return true;
        }

        return Date.now() - setTimeParsed > expiryMs();
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
                        <span>${utils.getTranslation('password.hint') || '提示：这只是防止误触的访问提示，任何能打开本页的人都能绕过它'}</span>
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
                this.showError(
                    errorDiv,
                    utils.getTranslation('password.errorEmpty') || '请输入密码'
                );
                return;
            }

            if (this.verify(password)) {
                modal.remove();
                this.onSuccess();
            } else {
                this.showError(
                    errorDiv,
                    utils.getTranslation('password.errorWrong') || '密码错误，请重试'
                );
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
        // 获取当前密码（可能是用户设置的密码，否则回退默认密码）
        // 默认密码来自**唯一来源** CONFIG.password.defaultPassword
        const storedPassword = localStorage.getItem(PASSWORD_KEY) || defaultPassword();
        return inputPassword === storedPassword;
    },

    // 验证成功回调
    onSuccess() {
        // 记录密码设置时间
        localStorage.setItem(PASSWORD_TIMESTAMP_KEY, Date.now().toString());
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

        const setTimeParsed = parseInt(setTime, 10);
        // 记录损坏 → 没有"剩余天数"可言（与 isPasswordExpired 的判定一致）
        if (!Number.isFinite(setTimeParsed)) return 0;

        const remaining = expiryMs() - (Date.now() - setTimeParsed);

        return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
    }
};
