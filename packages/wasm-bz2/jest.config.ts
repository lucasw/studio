// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

export default {
  preset: "ts-jest",
  globals: {
    "ts-jest": {
      babelConfig: {
        plugins: ["babel-plugin-transform-import-meta", "@babel/plugin-transform-modules-commonjs"],
      },
    },
  },
  testRunner: "jest-circus/runner",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
};
