module.exports = {
  preset: "jest-expo",
  testMatch: ["**/test/**/*.native.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!(?:\\.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo.*|@expo/.*|@biz/shared|@unimodules/.*|unimodules|react-native-svg)(/|$))",
  ],
};
