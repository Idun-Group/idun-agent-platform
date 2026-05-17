// Conventional Commits rules — inlined to keep the advisory pre-commit hook
// self-contained (no `npm install` required; the hook runs commitlint via
// `npx --yes @commitlint/cli@19` only).
//
// These rules mirror @commitlint/config-conventional@19. Drop the inline rules
// and replace with `extends: ["@commitlint/config-conventional"]` once the team
// adopts a local Node toolchain at the repo root.
//
// Severity: 0 = disabled, 1 = warning, 2 = error.

module.exports = {
  rules: {
    "body-leading-blank": [1, "always"],
    "body-max-line-length": [2, "always", 100],
    "footer-leading-blank": [1, "always"],
    "footer-max-line-length": [2, "always", 100],
    "header-max-length": [2, "always", 100],
    "header-trim": [2, "always"],
    "subject-case": [
      2,
      "never",
      ["sentence-case", "start-case", "pascal-case", "upper-case"],
    ],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
  },
};
