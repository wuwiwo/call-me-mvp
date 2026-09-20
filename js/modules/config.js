export const CONFIG = {
    webhookUrl: 'https://trigger.macrodroid.com/6eafac25-d8ec-4aff-b139-ca213fa50423/MVP',
    cooldownTime: 60, // 冷却时间(秒)
    maxHistoryRecords: 100, // 最大历史记录数
    // 已读回执：JSONBin 公开读（Master Key 仅在 MacroDroid 侧，不入网页）
    jsonBin: {
        binUrl: 'https://api.jsonbin.io/v3/b/6a4e36bdda38895dfe40054e/latest'
    },
    defaultAvatar: '👤', // 默认头像
    defaultName: {
        // 默认昵称
        zh: '玩家',
        en: 'Player',
        ja: 'プレイヤー', // 日语
        ko: '플레이어', // 韩语
        es: 'Jugador', // 西班牙语
        fr: 'Joueur' // 法语
    },
    emojiOptions: ['🐶', '🐱', '🦊', '🐯', '🦁', '🐨', '🐵', '🐧', '🦄', '🐟'], // 可选emoji头像
    notificationDuration: 4000, // 通知显示时间(毫秒)

    // 访问提示配置 —— **密码配置的唯一来源**
    //
    // ⚠️ 这是 UI 级访问提示，不是安全边界：值就写在这份前端源码里，
    // 任何能打开页面的人都能看到并绕过。详见 docs/SECURITY.md。
    // `js/modules/password.js` 从这里读取默认密码与有效期，
    // **不要在其他模块再硬编码一份**（历史上两处独立维护过，已收敛）。
    password: {
        defaultPassword: '666888', // 默认密码
        expiryDays: 7 // 密码过期天数
    },

    // 主题配置 —— **主题名称与合法值的唯一来源**
    //
    // 主题 = 「令牌集 + 布局类」（docs/DESIGN_THEME_SWITCH.md §4）：
    // 名字与合法值在这里，配色/布局一律由 CSS 的 `[data-theme="xxx"]` 承载，
    // **不在 JS 里复制第二份色值**（与 CM-010 的单一来源纪律同源）。
    // `js/modules/theme.js` 只从这里读取默认主题、合法列表与展示名键。
    themes: {
        default: 'bubble', // bubble = 全宽胶囊气泡列表（意象名「浮光絮语」）
        valid: ['bubble', 'list'], // list = 单列按钮列表主题（意象名「青笺行」）
        // ⚠️ 这里的 bubble/list 是**存储值**（写进 localStorage、写进 CSS 选择器），
        // 不改；用户看到的「浮光絮语 / 青笺行」是展示名，走 labelKeys 经 i18n 渲染。
        // LocalStorage key。与 appLanguage / buttonDisplayMode 一致，存**纯字符串**
        // （不是 JSON）—— 便于手工排查与控制台验证。
        // ⚠️ 同时被两个 html 的 <head> 防闪内联脚本按字面引用，改名必须一起改。
        storageKey: 'appTheme',
        // 展示名走 i18n 键（translations.theme.*），由 index.html 的
        // `data-i18n` 属性声明、language.updateUI() 统一填充。
        // 新增主题 = 这里加一个名字 + CSS 加一组令牌 + html 加一个菜单项。
        labelKeys: {
            bubble: 'theme.bubble',
            list: 'theme.list'
        }
    },

    // 新手引导配置
    onboarding: {
        enabled: true, // 是否启用新手引导
        stepDuration: 0 // 自动下一步的时间（0表示不自动）
    },

    //音效
    soundEffects: {
        avatars: {
            '🐶': 'sounds/dog-bark.mp3',
            '🐱': 'sounds/cat-meow.mp3',
            '🐯': 'sounds/tiger-roar.wav',
            '🦁': 'sounds/lion-roaring.mp3',
            '🐵': 'sounds/monkey-sound.wav',
            default: 'sounds/default-click.m4a'
        },
        // 操作反馈音效
        notifications: {
            success: 'sounds/success-notification.wav',
            // 失败/警告反馈：输入校验失败、初始化失败、冷却限制等（notification.show(msg, false)）
            error: 'sounds/error-notification.wav'
        }
    },
    //按钮
    buttons: {
        maxLength: 12, // 最大字数限制
        maxCustomButtons: 5, // 最多可添加5个自定义按钮
        defaultButtons: [
            {
                id: 'quick_online',
                message: '呼叫 R4/5（Call R4/5）',
                icon: 'bolt'
            },
            {
                id: 'emergency',
                message: '堡垒要塞',
                icon: 'exclamation-triangle'
            }
        ],
        // 默认按钮 legacy ID 映射。
        //
        // 历史版本按**数组位置**写入 `default_1` / `default_2`，
        // 而规范 ID 是 defaultButtons[n].id（语义化、与顺序无关）。
        // 这里声明 "位置式旧 ID → 规范 ID" 的一一对应，供读取时归一化：
        // 迁移只改 id，message / icon / 未知字段一律原样保留。
        //
        // 注意：映射到**位置**（数组下标）而非语义，
        // 因为旧配置的按钮本来就没有语义身份，位置是它唯一的依据。
        legacyDefaultIdMap: {
            default_1: 0,
            default_2: 1
        },
        // 自定义按钮 ID 前缀：`custom_<数字>` 视为持久 ID
        customIdPrefix: 'custom_',
        // 可选图标列表（Font Awesome
        availableIcons: [
            'bolt',
            'bell',
            'exclamation-triangle',
            'shield-alt',
            'fire',
            'clock',
            'running',
            'heartbeat',
            'phone',
            'comment-dots',
            'envelope',
            'bullhorn',
            'hand-paper',
            'star',
            'flag',
            'gift',
            'mug-hot',
            'utensils'
        ]
    }
};
