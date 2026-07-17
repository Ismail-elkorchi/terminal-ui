import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**'
    ]
  },
  js.configs.recommended,
  ...[
    ...tseslint.configs.strict,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked
  ].map((config) => ({ ...config, files: ['src/**/*.ts', 'examples/**/*.ts'] })),
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir
      }
    }
  },
  {
    files: ['examples/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.examples.json',
        tsconfigRootDir
      }
    }
  },
  {
    files: ['examples/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setInterval: 'readonly',
        setImmediate: 'readonly',
        setTimeout: 'readonly',
        structuredClone: 'readonly'
      }
    }
  },
  {
    files: ['tests/**/*.mjs'],
    rules: {
      'no-control-regex': 'off',
      'no-regex-spaces': 'off',
      'require-yield': 'off'
    }
  }
];
