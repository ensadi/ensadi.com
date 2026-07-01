const path = require('path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  timeout: 10000,
  fullyParallel: false,
  outputDir: path.join(__dirname, 'test-results'),
  reporter: [['html', { outputFolder: path.join(__dirname, 'results', 'html-report'), open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8000/apps/policesidekick',
    headless: true,
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    screenshot: 'off',
  },
  webServer: {
    command: 'python3 -m http.server 8000',
    port: 8000,
    cwd: path.join(__dirname, '..'),
    reuseExistingServer: false,
    timeout: 10000,
  },
});
