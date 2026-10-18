import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// Run `pnpm build` first: the tests load the built site, exactly as it would be deployed.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node e2e/static-server.ts dist/client ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
  },
});
