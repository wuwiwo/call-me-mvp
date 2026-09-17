export const CONFIG = {
    webhookUrl:
        "https://trigger.macrodroid.com/6eafac25-d8ec-4aff-b139-ca213fa50423/MVP",
    cooldownTime: 60, // 冷却时间(秒)
    maxHistoryRecords: 100, // 最大历史记录数
    // 已读回执：JSONBin 公开读（Master Key 仅在 MacroDroid 侧，不入网页）
    jsonBin: {
        binUrl: "https://api.jsonbin.io/v3/b/6a4e36bdda38895dfe40054e/latest"
    },
    defaultAvatar: "👤", // 默认头像
    defaultName: {
        // 默认昵称
        zh: "玩家",
        en: "Player",
        ja: "プレイヤー",      // 日语
        ko: "플레이어",        // 韩语
        es: "Jugador",        // 西班牙语
        fr: "Joueur"          // 法语
    },
    emojiOptions: ["🐶", "🐱", "🦊", "🐯", "🦁", "🐨", "🐵", "🐧", "🦄", "🐟"], // 可选emoji头像
    notificationDuration: 4000, // 通知显示时间(毫秒)
    
    // 密码验证配置
    password: {
        defaultPassword: "666888", // 默认密码
        expiryDays: 7 // 密码过期天数
    },
    
    // 新手引导配置
    onboarding: {
        enabled: true, // 是否启用新手引导
        stepDuration: 0 // 自动下一步的时间（0表示不自动）
    },
    
    //音效
    soundEffects: {
        avatars: {
            "🐶": "sounds/dog-bark.mp3",
            "🐱": "sounds/cat-meow.mp3",
            "🐯": "sounds/tiger-roar.wav",
            "🦁": "sounds/lion-roaring.mp3",
            "🐵": "sounds/monkey-sound.wav",
            default: "sounds/default-click.m4a"
        },
        // 操作反馈音效
        notifications: {
            success: "sounds/success-notification.wav"
        }
    },
    //按钮
    buttons: {
        maxLength: 12, // 最大字数限制
        maxCustomButtons: 5, // 最多可添加5个自定义按钮
        defaultButtons: [
            {
                id: "quick_online",
                message: "呼叫 R4/5（Call R4/5）",
                icon: "bolt"
            },
            {
                id: "emergency",
                message: "堡垒要塞",
                icon: "exclamation-triangle"
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
        customIdPrefix: "custom_",
        // 可选图标列表（Font Awesome
        availableIcons: [
            "bolt",
            "bell",
            "exclamation-triangle",
            "shield-alt",
            "fire",
            "clock",
            "running",
            "heartbeat",
            "phone",
            "comment-dots",
            "envelope",
            "bullhorn",
            "hand-paper",
            "star",
            "flag",
            "gift",
            "mug-hot",
            "utensils"
        ]
    }
};