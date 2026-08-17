/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
    // sanitize-html 的依赖链（htmlparser2 等）是 ESM-only，交给 ts-jest 转 CJS
    '^.+\.jsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // 允许 ESM-only 依赖被转译。模式同时兼容 npm 平铺 node_modules 与
  // pnpm 的 .pnpm/<pkg>@<ver>/node_modules/ 嵌套布局（负向前瞻命中即不忽略）。
  transformIgnorePatterns: [
    '/node_modules/(?!(?:[^/]+/)*?(?:sanitize-html|htmlparser2|domhandler|domutils|domelementtype|entities|dom-serializer|is-plain-object|launder|parse-srcset|postcss|nanoid|picocolors|source-map-js)(?:@[^/]*)?/)',
  ],
};
