module.exports = {
  preset: "jest-expo",
  modulePaths: [require("node:path").join(require("node:path").dirname(require.resolve("expo/package.json")), "node_modules")],
  testMatch: ["**/test/**/*.native.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!(?:\\.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo.*|@expo/.*|@biz/shared|@unimodules/.*|unimodules|react-native-svg)(/|$))",
  ],
};
