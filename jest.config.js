/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Override tsconfig module to CommonJS for jest compatibility
        tsconfig: { module: 'commonjs', moduleResolution: 'node' },
      },
    ],
  },
};
