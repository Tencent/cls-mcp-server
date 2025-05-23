module.exports = {
    extends: [
        'eslint-config-tencent',
        'eslint-config-tencent/ts',
        'eslint-config-tencent/prettier',
        'plugin:import/errors',
        'plugin:import/typescript',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: '.',
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true,
        },
    },
    settings: {
        react: {
            pragma: 'React',
            version: '17.0.2',
        },
        'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts', '.tsx'],
        },
        'import/resolver': {
            typescript: {
                alwaysTryTypes: true,
                project: ['./tsconfig.json'],
            },
        },
        polyfills: ['es:all'],
    },
    root: true,
    env: {
        node: true,
        jest: true,
    },
    plugins: [
        '@typescript-eslint',
        'import',
        'prettier',
    ],
    rules: {
        'import/no-unresolved':'off',
        'import/order': [
            'error',
            {
                groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index'],
                'newlines-between': 'always',
                alphabetize: {
                    order: 'asc',
                    caseInsensitive: true,
                },
            },
        ],
    }
};
