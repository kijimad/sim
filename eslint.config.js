import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**"],
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- 型安全 ---
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/return-await": ["error", "always"],
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/no-redundant-type-constituents": "error",
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true, allowBoolean: true }],
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-invalid-void-type": "error",
      "@typescript-eslint/unified-signatures": "error",
      "@typescript-eslint/method-signature-style": ["error", "property"],

      // --- 一般 ---
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-throw-literal": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "warn",
      curly: ["error", "multi-line"],
    },
  },
  {
    files: ["**/*.tsx"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      // テストでは non-null assertion を許容する
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },
);
