import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    { ignores: ['node_modules/', '.history/'] },
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
        files: ['tools/**/*.mjs'],
        languageOptions: {
            globals: { ...globals.node }
        }
    },
    eslintConfigPrettier
];
