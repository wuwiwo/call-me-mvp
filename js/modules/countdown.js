// /src/modules/countdown.js
//
// CM-006：cooldown 的**唯一责任者**（single owner）。
//
// 为什么集中到本模块，而不是 state.js：
//   本模块已经持有冷却显示与唯一可取消的 interval。若把责任放到 state.js，
//   state.js 就需要反向导入本模块来驱动 DOM，形成 state <-> countdown 循环依赖。
//   放在这里可保持依赖单向：countdown -> state（只写 state.canClick）。
//
// 本模块**独占**以下三件事，其他模块不得再实现或重复写入：
//   1. 冷却状态转换：state.canClick
//   2. `lastClickTime` 的持久化（写入与删除）
//   3. 倒计时 timer 的生命周期（同一时刻最多一个）
//
// 集中前的问题（CM-001-TD-05）：
//   state.checkCooldownStatus、main.checkCooldown 各建一个**不可取消的 setTimeout**
//   来恢复 canClick，countdown 又建一个 setInterval —— 一次冷却会同时存在 3 个计时器；
//   同时 buttonManager 与 notification 各写一次 `lastClickTime`（重复写入，
//   且两次时间戳相差一个调用间隔）。旧代码没有任何机制阻止旧定时器在重新开始冷却后
//   改写 canClick，存在冷却被提前解除的路径。
//
// 对外接口（其他模块只能调用这些）：
//   restore()       页面加载 / 刷新：按 storage 恢复冷却，或清理不可用的值
//   startFromNow()  用户点击：以当前时间为起点开始冷却
//   cancel()        请求失败回滚：放行并清除冷却
//   remaining()     只读：剩余秒数（用于提示文案与断言）
//   init()/updateDisplay()  显示层初始化与刷新
import { CONFIG } from './config.js';
import { utils } from './utils.js';
import { state } from './state.js';

// 冷却起始时间戳的 LocalStorage key。
// **不改变 key 名与语义**；写入格式为 String(Date.now())。
// （LocalStorage 本身只存字符串，旧代码写入 Number 与 String 落盘结果一致，
//   且读取方一律 parseInt，因此对历史数据完全兼容。）
const STORAGE_KEY = 'lastClickTime';

/**
 * 读取并校验存储的冷却起始时间戳。
 *
 * @returns {number|null} 可用的起始时间戳；null 表示不可用
 *   （缺失 / 非数字 / 非有限数 / 非正数）。
 */
function readStoredStart() {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        // storage 不可访问（隐私模式等）：按"无冷却"处理，不阻断页面
        console.warn('[cooldown] 无法读取 ' + STORAGE_KEY + ':', e);
        return null;
    }

    if (raw === null || raw === '') return null;

    const parsed = parseInt(raw, 10);
    // Infinity / NaN / 0 / 负数都不可用
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

export const countdown = {
    elements: null,

    // 当前 timer 句柄；null 表示没有在跑的倒计时。
    timer: null,

    remainingTime: 0,

    // 代数标记（generation）。
    //
    // 每次武装新倒计时 / 主动放行时自增，interval 回调只认自己那一代：
    // 因此即便某个旧 timer 的回调在新状态建立之后才被执行，
    // 也无法改写新的冷却状态（对应验收要求「旧 timer 不会覆盖新状态」）。
    generation: 0,

    init(elements) {
        this.elements = elements;
    },

    // ── 只读查询（无副作用） ──

    /** 剩余秒数，下限 0。 */
    remaining() {
        return Math.max(0, Math.floor(this.remainingTime));
    },

    // ── 状态转换：唯一入口 ──

    /**
     * 页面加载 / 刷新时恢复冷却状态。
     *
     * 行为表（每种情况都有确定行为）：
     * - 无 `lastClickTime`        → 无冷却，保持放行，不写 storage
     * - 非数字 / 非有限 / 非正数  → 视为非法：**清除该 key** 并放行
     *                               （沿用既有的"非法值清理"语义）
     * - 已过期                    → **清除该 key** 并放行
     * - 未来时间戳                → 视为"刚点击过"，按完整冷却处理（见 _remainingFrom）
     * - 未过期                    → 按剩余时间启动倒计时
     *
     * @returns {boolean} 恢复后是否处于冷却中
     */
    restore() {
        const start = readStoredStart();

        if (start === null) {
            // 缺失或非法：非法值沿用既有清理语义（移除 key），两种情况都放行
            this._clearStored();
            this._release();
            return false;
        }

        const remaining = this._remainingFrom(start, Date.now());
        if (remaining > 0) {
            this._arm(remaining);
            return true;
        }

        // 已过期：清理并放行
        this._clearStored();
        this._release();
        return false;
    },

    /**
     * 用户点击后开始冷却：以"现在"为起点。
     *
     * 持久化与状态转换都在这里完成 —— 调用方（buttonManager）
     * 不再自己写 `lastClickTime` 或 `state.canClick`。
     */
    startFromNow() {
        this._persist(Date.now());
        this._arm(CONFIG.cooldownTime);
    },

    /**
     * 取消冷却（用于请求失败回滚）：放行 + 清除持久化 + 停 timer。
     *
     * 与内部 `_stopTimer()` 的区别：`cancel()` 是**完整回滚**（连状态与存储一起恢复），
     * `_stopTimer()` 只停计时、不动状态。外部模块需要中断冷却时只能调用 `cancel()`，
     * 避免出现"停了 timer 但 canClick 仍是 false"的卡死状态。
     */
    cancel() {
        this._clearStored();
        this._release();
    },

    // ── timer 生命周期 ──

    /**
     * 启动（或重启）倒计时。
     *
     * 任何入口都先 teardown 再 arm，因此**同一时刻最多存在一个 timer**，
     * 重复调用不会叠加 interval。
     *
     * @param {number} seconds 冷却秒数
     */
    _arm(seconds) {
        this._stopTimer();

        this.remainingTime = seconds;
        state.canClick = false;

        // 武装新的一代，并让回调只认这一代
        this.generation += 1;
        const gen = this.generation;

        this.updateDisplay();
        if (this.elements?.countdownEl) {
            this.elements.countdownEl.classList.add('active');
        }

        this.timer = setInterval(() => {
            // 旧 timer 的回调一律忽略：不得在新状态之后改写 canClick
            if (gen !== this.generation) return;

            this.remainingTime -= 1;
            this.updateDisplay();

            if (this.remainingTime <= 0) {
                // 归零：清除持久化 + 放行（放行同时会停掉本 timer）
                this._clearStored();
                this._release();
            }
        }, 1000);
    },

    /** 停掉当前 timer 与激活样式；不改动 state.canClick / lastClickTime。 */
    _stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.elements?.countdownEl) {
            this.elements.countdownEl.classList.remove('active');
        }
    },

    /**
     * 放行：停 timer、剩余归零、canClick = true。
     *
     * 同时自增 generation，使任何仍在飞行中的旧回调失效。
     */
    _release() {
        this._stopTimer();
        this.generation += 1;
        this.remainingTime = 0;
        state.canClick = true;
        this.updateDisplay();
    },

    // ── 持久化：只有本模块可调用 ──

    _persist(timestamp) {
        try {
            localStorage.setItem(STORAGE_KEY, String(timestamp));
        } catch (e) {
            console.warn('[cooldown] 无法写入 ' + STORAGE_KEY + ':', e);
        }
    },

    _clearStored() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('[cooldown] 无法清除 ' + STORAGE_KEY + ':', e);
        }
    },

    /**
     * 由起始时间戳推算剩余秒数。
     *
     * 未来时间戳（时钟回拨或被手工篡改）会算出**大于完整冷却**的剩余时间。
     * 这里把它 clamp 到 `CONFIG.cooldownTime`，把影响限制在一个冷却周期内，
     * 避免用户被一个未来时间戳长时间锁死（例如时钟被向前校正后无法点击）。
     *
     * @param {number} start 起始时间戳
     * @param {number} now 当前时间戳
     * @returns {number} 剩余秒数，0 表示已过期
     */
    _remainingFrom(start, now) {
        const elapsed = Math.floor((now - start) / 1000);
        const remaining = CONFIG.cooldownTime - elapsed;
        if (remaining <= 0) return 0;
        return Math.min(remaining, CONFIG.cooldownTime);
    },

    // ── 显示 ──

    updateDisplay() {
        if (!this.elements || !this.elements.countdownNameEl || !this.elements.countdownTextEl) {
            console.error('Countdown elements not found');
            return;
        }

        // 更新用户信息
        this.elements.countdownNameEl.textContent = state.userProfile?.nickname || '';
        this.elements.countdownAvatarEl.textContent =
            state.userProfile?.emoji || CONFIG.defaultAvatar;

        // 更新倒计时文本 - 使用正确的翻译
        if (this.remainingTime > 0) {
            // 使用 seconds 而不是 time，因为翻译文件中使用的是 {seconds}
            this.elements.countdownTextEl.textContent = utils.formatString(
                utils.getTranslation('mainPage.cooldownMsg'),
                { seconds: this.remainingTime }
            );
        } else {
            this.elements.countdownTextEl.textContent = '';
        }
    }
};
