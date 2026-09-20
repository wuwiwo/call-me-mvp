// soundToggle.js
//
// 音效开关 UI —— 与 theme.js 同构的**单职责**模块。
//
// 职责边界：
// - 只有这里绑 `#toggleSound` 的点击与图标/文案同步
// - 但 `soundEnabled` 的**唯一写入者仍是 sounds.js**（soundManager.toggle()）——
//   本模块不直接碰 localStorage，只调 soundManager。
// 这样"开关状态"永远只有一份真相，不会出现 UI 与播放行为不一致。
import { soundManager } from './sounds.js';
import { utils } from './utils.js';

export const soundToggle = {
    el: null,

    /**
     * 两页都可安全调用：history.html 没有 ⋯ 菜单 → 找不到节点就静默跳过。
     * （历史页只读 soundEnabled，不提供开关，符合"历史页只读"的设定。）
     */
    init() {
        const el = document.getElementById('toggleSound');
        if (!el) return;

        this.el = el;
        // 初始同步一次：图标/文案必须反映持久化后的真实状态，
        // 否则刷新后会看到"关着但显示开"
        this.sync();

        el.addEventListener('click', () => {
            soundManager.toggle(!soundManager.enabled);
            this.sync();
        });
    },

    /**
     * 按 soundManager.enabled 同步图标 + 文案。
     * 状态只从 soundManager 推导，本模块不缓存副本。
     */
    sync() {
        const el = this.el || document.getElementById('toggleSound');
        if (!el) return;

        const on = soundManager.enabled;

        const icon = el.querySelector('i');
        if (icon) {
            // 关闭态用 volume-xmark（无 v6 的 volume-mute 别名差异问题）
            icon.className = on ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
        }

        const label = el.querySelector('.more-item-label');
        if (label) {
            // 直接写 textContent —— 这里刻意**不用 data-i18n**：
            // 文案随开关状态变化，是状态而非静态文案，
            // 交给 applyDeclarativeTexts 会被语言切换重置成固定值。
            label.textContent = utils.getTranslation(on ? 'sound.on' : 'sound.off');
        }
    }
};
