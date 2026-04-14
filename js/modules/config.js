const basePath = location.pathname.includes("github.io") ? "/call-me/" : "/";
export const CONFIG = {
    webhookUrl:
        "https://trigger.macrodroid.com/6eafac25-d8ec-4aff-b139-ca213fa50423/MVP",
    cooldownTime: 60, // 冷却时间(秒)
    maxHistoryRecords: 100, // 最大历史记录数
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
            "🦊": "sounds/fox-sound.mp3",
            "🐯": "sounds/tiger-roar.wav",
            "🦁": "sounds/lion-roaring.mp3",
            "🐵": "sounds/monkey-sound.wav",
            default: "sounds/default-click.m4a"
        },
        // 操作反馈音效
        notifications: {
            success: "sounds/success-notification.wav",
            error: "sounds/error-alert.mp3"
        }
    },
    //按钮
    buttons: {
        maxLength: 12, // 最大字数限制
        maxCustomButtons: 5, // 最多可添加2个自定义按钮
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
        // 可选图标列表（Font Awesome
        availableIcons: [
            "bolt",
            "exclamation-triangle",
            "bell",
            "running",
            "clock",
            "heartbeat",
            "fire",
            "shield-alt"
        ]
    }
};