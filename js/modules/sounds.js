// sounds.js
//
// ⚠️ 这个模块是 `soundEnabled` 的**唯一写入者**（沿用项目单职责纪律，
// 与 countdown.js 独占 lastClickTime / theme.js 独占 appTheme 同源）。
// 其他模块只读 `soundManager.enabled`，不要自己写 localStorage。
import { CONFIG } from './config.js';

const STORAGE_KEY = 'soundEnabled';

class SoundManager {
    constructor() {
        this.audioCache = new Map();
        // A1-1：持久化。之前 enabled 只在内存，刷新即丢 → iPhone 上表现为"开关不生效"。
        // 存**纯字符串**（对齐 appLanguage / buttonDisplayMode / appTheme 的既定格式），
        // 便于手工排查；非法/缺失一律视为开启（默认开）。
        this.enabled = this.readEnabled();
        this.unlocked = false;
        this.lastError = null;
        // A2：click 音效节流。一次点击可能触发多个委托（按钮 + 全局监听），
        // 80ms 内只响一次，避免叠音。
        this.lastClickAt = 0;
        this.clickThrottleMs = 80;
    }

    readEnabled() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw === null) return true; // 未设置 → 默认开
            return raw !== 'false'; // 只有显式 'false' 才关，其余（含垃圾值）按开
        } catch {
            return true; // localStorage 不可用（隐私模式）→ 不因存储问题静默静音
        }
    }

    writeEnabled(value) {
        try {
            localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
        } catch (e) {
            // 写失败不影响本次会话的开关行为（内存已更新），但要留痕便于排查
            console.warn('音效开关持久化失败:', e);
        }
    }

    // 预加载音效
    async preload() {
        const allSounds = [
            ...Object.values(CONFIG.soundEffects.avatars),
            ...Object.values(CONFIG.soundEffects.notifications),
            // A2：全局 click 音效也要预加载，否则首次点击才去请求 → 听不到
            CONFIG.soundEffects.click
        ].filter(Boolean);

        await Promise.all(allSounds.map((url) => this.load(url)));
    }

    // 加载单个音效
    async load(url) {
        if (!url) return;
        if (!this.audioCache.has(url)) {
            // ⚠️ A1-2：必须**复用同一实例**。iOS 的解锁是「把某个 Audio 元素
            // 标记为已授权」，每次 new Audio 都会产生新的未解锁实例，
            // 解锁就白做了。缓存 Map 正是为此存在，不要改成每次新建。
            const audio = new Audio(url);
            audio.preload = 'auto';
            audio.load();
            this.audioCache.set(url, audio);
        }
    }

    /**
     * A1-2：iOS 音频解锁。
     *
     * iOS/Safari 要求首次 `play()` 发生在**用户手势的同步调用栈内**，否则
     * 后续所有 play() 都会被拒绝（NotAllowedError）。`new Audio().load()`
     * （即 preload）**不解锁** —— 这是"明明预加载了却不响"的根因。
     *
     * 做法：在首个 pointerdown（capture + once）里，对每个已缓存实例执行
     * play() → pause() → currentTime = 0。手势内静音"播放"一次即完成授权，
     * 之后即使不在手势里也能正常出声。
     *
     * @returns {Promise<boolean>} 是否成功解锁（至少一个实例被授权）
     */
    async unlock() {
        if (this.unlocked) return true;

        const audios = [...this.audioCache.values()];
        if (!audios.length) return false;

        let anyOk = false;
        await Promise.all(
            audios.map(async (audio) => {
                try {
                    const prevVolume = audio.volume;
                    audio.volume = 0; // 解锁动作不该让用户听到"哑音"
                    await audio.play();
                    audio.pause();
                    audio.currentTime = 0;
                    audio.volume = prevVolume;
                    anyOk = true;
                } catch {
                    // 单个失败不影响其余；解锁失败会在真正 play 时再被兜底
                }
            })
        );

        this.unlocked = anyOk;
        return anyOk;
    }

    /**
     * 在首个用户手势上挂接解锁。capture 阶段 + once，
     * 确保不被业务代码的 stopPropagation 拦掉，且只执行一次。
     * @param {EventTarget} target 默认 document
     */
    installUnlockHandler(target = document) {
        const handler = () => {
            this.unlock().catch(() => {});
        };
        // pointerdown 覆盖触摸/鼠标/笔；capture 保证早于业务监听；once 自动摘除
        target.addEventListener('pointerdown', handler, { capture: true, once: true });
        // 键盘用户（Tab + Enter）没有 pointerdown —— 补一个 keydown 兜底
        target.addEventListener('keydown', handler, { capture: true, once: true });
    }

    /**
     * 播放音效，失败时自动补一次解锁并重试。
     *
     * A1-3：旧实现把失败 `console.warn` 就完事 → 静默失败极难排查。
     * 现在：先重试一次（iOS 上"首次手势漏解锁"最常见的场景），
     * 仍失败则记入 `lastError` 供排查，同时保留 warn。
     */
    play(url) {
        if (!this.enabled || !url) return;

        const audio = this.audioCache.get(url);
        if (!audio) return;

        audio.currentTime = 0; // 重置播放位置
        audio.play().catch(async (e) => {
            this.lastError = e;
            // 兜底：可能手势已经过了但一直没解锁 → 试着补解锁再重试一次
            if (!this.unlocked) {
                const ok = await this.unlock();
                if (ok) {
                    try {
                        audio.currentTime = 0;
                        await audio.play();
                        return; // 重试成功
                    } catch (e2) {
                        this.lastError = e2;
                    }
                }
            }
            console.warn('音效播放失败:', this.lastError);
        });
    }

    // A2：全局点击音效（带节流）
    playClick() {
        if (!this.enabled) return;
        const now = Date.now();
        if (now - this.lastClickAt < this.clickThrottleMs) return;
        this.lastClickAt = now;
        this.play(CONFIG.soundEffects.click);
    }

    // 头像点击音效
    playAvatarSound(emoji) {
        const sound = CONFIG.soundEffects.avatars[emoji] || CONFIG.soundEffects.avatars.default;
        this.play(sound);
    }

    // 操作反馈音效
    playNotificationSound(isSuccess) {
        const type = isSuccess ? 'success' : 'error';
        const url = CONFIG.soundEffects.notifications[type];

        // 防御性检查：配置缺失时不要往下传 undefined。
        // audioCache 里不会有 undefined 这个键，play() 会静默什么都不做 ——
        // 这类"静默失败"极难排查，所以在这里显式拦下并给出一条可定位的提示。
        if (!url) {
            console.warn(`音效未配置：soundEffects.notifications.${type}`);
            return;
        }

        this.play(url);
    }

    // 全局开关（A1-1：写入持久化 + A4 并存）
    toggle(enable) {
        this.enabled = !!enable;
        this.writeEnabled(this.enabled);
    }
}

export const soundManager = new SoundManager();
