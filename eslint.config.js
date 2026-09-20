import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    // `.workbuddy/` 是 .gitignore 掉的本地目录（AI 会话记忆、临时备份、一次性证据脚本），
    // **不属于项目源码、不会随仓库分发**。不忽略它会有两个后果：
    //   1. 任何放进该目录的 `.mjs` 都会被按"浏览器环境"检查（那里没有 process 等 Node 全局），
    //      于是本地随手放一个脚本就把 `npm run lint` / `npm test` 打红；
    //   2. 该目录被 gitignore，CI 上根本不存在 → 本地红、CI 绿的不一致。
    // 参照 AGENTS.md「运行时日志、临时备份和本机路径应脱敏或加入忽略规则」。
    { ignores: ['node_modules/', '.history/', '.workbuddy/'] },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.browser }
        },
        rules: {
            // 未使用变量告警（保留以 _ 开头的参数）
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            // 保留 console.error / console.warn，不限制 console
            'no-console': 'off'
        }
    },
    {
        // 验证/工具脚本：Node 环境（不属于前端产物）
        // `scripts/`（GOV-002 守卫移出 tools/ 后的新位置）与 `tools/` 同属 Node 脚本
        files: ['tools/**/*.mjs', 'scripts/**/*.mjs'],
        languageOptions: {
            globals: { ...globals.node }
        }
    },
    {
        // Service Worker（S5）：经典脚本（非 module），全局是 SW 专用的一套
        // （self / caches / clients / skipWaiting），用 serviceworker 环境而不是 browser
        files: ['sw.js'],
        languageOptions: {
            sourceType: 'script',
            globals: { ...globals.serviceworker }
        }
    },
    eslintConfigPrettier
];
