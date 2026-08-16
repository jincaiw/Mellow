/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
    // sanitize-html 的依赖链（htmlparser2 等）是 ESM-only，交给 ts-jest 转 CJS
    '^.+\\.jsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(sanitize-html|htmlparser2|domhandler|domutils|domelementtype|entities|dom-serializer|is-plain-object|launder)/)',
  ],
};
