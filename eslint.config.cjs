// eslint.config.cjs
const js = require('@eslint/js');
const globals = require('globals');
const reactPlugin = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  // Игнор сборок/временных
  { ignores: ['node_modules/**', 'client/build/**', 'server/temp/**'] },

  // --- Клиент: JSX/React ---
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      // JSX включаем через parserOptions
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Базовые рекомендации
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // --- Ослабляем то, что сейчас «шумит» ---
      // React 17+ / 18 / 19: импорт React для JSX не обязателен
      'react/react-in-jsx-scope': 'off',
      // Мы не используем PropTypes (большие формы) — отключим
      'react/prop-types': 'off',
      // Иногда есть анонимные компоненты (мелкие инлайн-рендеры)
      'react/display-name': 'off',
      // Пустые блоки встречаются как заглушки — пока предупреждение
      'no-empty': 'warn',
      // Логи нам нужны в деве
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      // Регэксп «лишние экранирования» — временно отключим (много сработок)
      'no-useless-escape': 'off',
      // Мягче к неиспользуемым аргументам
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // --- Тесты: дать Jest-глобалы, чтобы не было no-undef ---
  {
    files: ['client/src/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    rules: {
      // те же послабления, что и для клиента
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'no-empty': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-useless-escape': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // --- Сервер: современный JS, приватные поля и т.д. ---
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-empty': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-useless-escape': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Выключаем стили, конфликтующие с Prettier
  eslintConfigPrettier,
];
