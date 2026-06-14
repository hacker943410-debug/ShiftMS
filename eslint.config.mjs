import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// 자동 코드 점검(ESLint) 기본 설정.
// 현재는 타입 정보를 쓰지 않는 권장 규칙으로 시작한다(빠르고 잡음이 적음).
// 떠다니는 비동기 호출(no-floating-promises) 같은 타입 인식 규칙은 추후 단계적으로 강화한다.
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "release/**",
      "node_modules/**",
      "artifacts/**",
      "coverage/**",
      "build/**",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      // 타입스크립트가 미정의 변수를 이미 잡으므로 중복 규칙은 끈다.
      "no-undef": "off",
      // 파일명·셀 값에서 제어문자(\x00-\x1f)를 의도적으로 제거하는 정규식이 여러 곳에 있어 허용한다.
      "no-control-regex": "off",
      // `interface X extends Y {}` 형태의 별칭용 빈 인터페이스는 허용한다.
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
      // 안 쓰는 변수/인자는 경고로 시작(이름이 _ 로 시작하면 의도된 미사용으로 간주).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      // any 사용은 경고(점진적으로 줄여 나간다).
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
);
