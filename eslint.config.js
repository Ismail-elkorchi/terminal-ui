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
  ...tseslint.configs.strict,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir
      }
    }
  }
];
