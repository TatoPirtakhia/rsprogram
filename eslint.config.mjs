import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.expo/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
