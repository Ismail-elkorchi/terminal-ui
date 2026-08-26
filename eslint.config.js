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
  ].map((config) => ({
    ...config,
    files: [
      'src/**/*.ts',
      'examples/**/*.ts',
      'tests/contracts/**/*.ts',
      'tests/**/*.test.ts',
      'tests/helpers/**/*.ts',
      'tests/support/**/*.ts'
    ]
  })),
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir
      }
    },
    rules: {
      complexity: ['error', { max: 25, variant: 'modified' }]
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
    files: [
      'src/**/*.test.ts',
      'tests/contracts/**/*.ts',
      'tests/**/*.test.ts',
      'tests/helpers/**/*.ts',
      'tests/support/**/*.ts'
    ],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.tests.json',
        tsconfigRootDir
      }
    }
  },
  {
    files: ['tests/contracts/types/**/*.contract.ts'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-unnecessary-type-arguments': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/require-await': 'off'
    }
  },
  {
    files: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-control-regex': 'off'
    }
  },
  {
    files: ['examples/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
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
