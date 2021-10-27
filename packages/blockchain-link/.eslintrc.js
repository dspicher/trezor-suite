module.exports = {
    extends: '../../.eslintrc.js',
    parserOptions: {
        project: ['./tsconfig.json'],
    },
    overrides: [
        {
            files: ['**/electrum/api.ts', '**/electrum/methods/*', '**/electrum/utils/*'],
            rules: {
                camelcase: "off",
            },
        }
    ]
};
