// ESLint 9 扁平配置 —— 仅校验云函数源码（cloudfunctions/**）
const js = require('@eslint/js')
const globals = require('globals')
const prettier = require('eslint-config-prettier')

module.exports = [
  {
    // 作用范围：仅云函数目录
    files: ['cloudfunctions/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // 云函数风格偏好
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
    },
  },
  prettier,
  {
    // 不扫描小程序前端与依赖
    ignores: ['**/node_modules/**', 'miniprogram/**', 'scripts/**'],
  },
]
