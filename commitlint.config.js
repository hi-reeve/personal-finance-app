export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "core",
        "protocol",
        "tokens",
        "config",
        "web",
        "mobile",
        "desktop",
        "relay",
        "ci",
        "deps",
        "docs",
        "repo",
      ],
    ],
  },
};
