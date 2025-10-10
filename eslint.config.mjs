import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
import jsxA11y from './lib/eslint-plugin-jsx-a11y.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'tests/dist/**',
    ],
  },
  {
    plugins: { 'jsx-a11y-local': jsxA11y },
    rules: {
      'jsx-a11y-local/anchor-is-valid': 'warn',
      'jsx-a11y-local/click-events-have-key-events': 'warn',
      'jsx-a11y-local/label-has-associated-control': 'warn',
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  // Prettierの設定は、他の設定を上書きするため配列の最後に配置します
  eslintConfigPrettier,
];

export default eslintConfig;
