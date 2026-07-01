const { test, expect } = require('@playwright/test');

const DATASET_ID = 'AL-JeffCo-Sheriff';
const DATASET_FILE = '10Codes.html';
const FREE_DATASET_ID = 'miranda';
const UPDATED_DATASET_ID = 'AL-JeffCo-Sheriff';
const UPDATED_METADATA = {
  version: '9.9.9',
  body: '<h1>Updated Dataset Content</h1>',
};

async function clearSiteData(page) {
  await page.context().clearCookies();
  await page.goto('');
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {
      console.warn('Failed to clear browser storage:', error);
    }

    return new Promise((resolve) => {
      try {
        const request = indexedDB.deleteDatabase('police-sidekick-datasets');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      } catch (error) {
        console.warn('Failed to clear IndexedDB:', error);
        resolve();
      }
    });
  });
}

test.describe('Police Sidekick app', () => {
  test.beforeEach(async ({ page }) => {
    await clearSiteData(page);
    await page.goto('');
  });

  test('Page loads in a clean browser', async ({ page }) => {
    await page.goto('');
    await expect(page).toHaveTitle(/Police Sidekick/);
    await expect(page.getByRole('heading', { name: 'Police Sidekick' })).toBeVisible();
  });

  test('About page loads', async ({ page }) => {
    await page.goto('#/about');
    await expect(page.locator('text=About Police Sidekick')).toBeVisible();
    await expect(page.locator('#app-status')).toHaveText(/Ready|Loading/);
  });

  test('Check for update button works', async ({ page }) => {
    await page.goto('#/about');
    await page.click('#check-updates-btn');
    await expect(page.locator('#app-status')).toHaveText(/Checking for app updates...|App is up to date\./, { timeout: 10000 });
  });

  test('Force update app button works', async ({ page }) => {
    await page.goto('#/about');
    await page.click('#force-update-btn');
    await expect(page).toHaveURL(/\//);
  });

  test('View free content works', async ({ page }) => {
    await page.goto('');
    await page.click(`button.view-btn[data-id="${FREE_DATASET_ID}"]`);
    await expect(page.locator('#view-file-viewer')).toBeVisible();
    await expect(page.locator('.file-viewer-header')).toContainText('Miranda Rights');
  });

  test('Download dataset from main page works', async ({ page }) => {
    await page.goto('');
    await page.click(`button.download-btn[data-id="${DATASET_ID}"]`);
    await expect(page.locator(`.dataset-card[data-id="${DATASET_ID}"] .dataset-status.downloaded`)).toBeVisible({ timeout: 10000 });
  });

  test('Download dataset from dataset details works', async ({ page }) => {
    await page.goto(`#/dataset/${DATASET_ID}`);
    await expect(page.locator('button.download-btn:visible')).toHaveCount(1, { timeout: 10000 });
    await page.click('button.download-btn:visible');
    await expect(page.locator('button.delete-btn:visible')).toBeVisible({ timeout: 10000 });
  });

  test('Delete download works', async ({ page }) => {
    await page.goto(`#/dataset/${DATASET_ID}`);
    await expect(page.locator('button.download-btn:visible')).toHaveCount(1, { timeout: 10000 });
    await page.click('button.download-btn:visible');
    await expect(page.locator('button.delete-btn:visible')).toBeVisible({ timeout: 10000 });
    await page.click('button.delete-btn:visible');
    await page.click('.confirm-dialog button:has-text("Delete"):visible');
    await expect(page.locator('button.download-btn:visible')).toBeVisible({ timeout: 10000 });
  });

  test('File view works after download', async ({ page }) => {
    await page.goto(`#/dataset/${DATASET_ID}`);
    await expect(page.locator('button.download-btn:visible')).toHaveCount(1, { timeout: 10000 });
    await page.click('button.download-btn:visible');
    await expect(page.locator('button.delete-btn:visible')).toBeVisible({ timeout: 10000 });
    await page.click(`button.file-link[data-file-name="${DATASET_FILE}"]`);
    await expect(page.locator('#view-file-viewer')).toBeVisible();
    await expect(page.locator('.file-viewer-file')).toContainText(DATASET_FILE);
  });

  test('Check for dataset update works', async ({ page }) => {
    const descriptionUrl = `**/ensadi/PoliceSidekick/DataSets/${UPDATED_DATASET_ID}/Description.plist`;
    let descriptionRequestCount = 0;

    await page.context().route(descriptionUrl, async (route) => {
      const version = descriptionRequestCount++ === 0 ? '0.0.0' : UPDATED_METADATA.version;
      await route.fulfill({
        status: 200,
        contentType: 'application/xml',
        headers: { 'Cache-Control': 'no-store' },
        body: `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n  <key>Name</key>\n  <string>JeffCo Sheriff</string>\n  <key>Files</key>\n  <dict>\n    <key>10 Codes</key>\n    <string>${DATASET_FILE}</string>\n  </dict>\n  <key>Version</key>\n  <string>${version}</string>\n</dict>\n</plist>`,
      });
    });

    await page.goto('');
    await expect(page.locator(`button.download-btn[data-id="${UPDATED_DATASET_ID}"]`)).toBeVisible({ timeout: 10000 });
    await page.click(`button.download-btn[data-id="${UPDATED_DATASET_ID}"]`);
    await expect(page.locator(`.dataset-card[data-id="${UPDATED_DATASET_ID}"] .dataset-status.downloaded`)).toBeVisible({ timeout: 10000 });
    await page.goto(`#/dataset/${UPDATED_DATASET_ID}`);
    await expect(page.locator('.update-available')).toBeVisible({ timeout: 10000 });
  });

  test('Download dataset update works with mocked updated dataset', async ({ page }) => {
    const descriptionUrl = `**/ensadi/PoliceSidekick/DataSets/${UPDATED_DATASET_ID}/Description.plist`;
    const fileUrl = `**/ensadi/PoliceSidekick/DataSets/${UPDATED_DATASET_ID}/${DATASET_FILE}`;
    let descriptionRequestCount = 0;

    await page.context().route(descriptionUrl, async (route) => {
      const version = descriptionRequestCount++ === 0 ? '0.0.0' : UPDATED_METADATA.version;
      await route.fulfill({
        status: 200,
        contentType: 'application/xml',
        headers: { 'Cache-Control': 'no-store' },
        body: `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n  <key>Name</key>\n  <string>JeffCo Sheriff</string>\n  <key>Files</key>\n  <dict>\n    <key>10 Codes</key>\n    <string>${DATASET_FILE}</string>\n  </dict>\n  <key>Version</key>\n  <string>${version}</string>\n</dict>\n</plist>`,
      });
    });

    await page.context().route(fileUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        headers: { 'Cache-Control': 'no-store' },
        body: `<html><body>${UPDATED_METADATA.body}</body></html>`,
      });
    });

    await page.goto('');
    await expect(page.locator(`button.download-btn[data-id="${UPDATED_DATASET_ID}"]`)).toBeVisible({ timeout: 10000 });
    await page.click(`button.download-btn[data-id="${UPDATED_DATASET_ID}"]`);
    await expect(page.locator(`.dataset-card[data-id="${UPDATED_DATASET_ID}"] .dataset-status.downloaded`)).toBeVisible({ timeout: 10000 });

    await page.goto(`#/dataset/${UPDATED_DATASET_ID}`);
    await expect(page.locator('button.update-btn:visible')).toBeVisible({ timeout: 10000 });
    await page.click('button.update-btn:visible');
    await expect(page.locator('text=Update available')).toBeHidden({ timeout: 10000 });
    await page.click(`button.file-link[data-file-name="${DATASET_FILE}"]`);
    await expect(page.locator('iframe')).toBeVisible();
    const frame = await page.frameLocator('iframe').locator('body');
    await expect(frame).toContainText('Updated Dataset Content');
  });

  test('Offline access works', async ({ page }) => {
    await page.goto(`#/dataset/${DATASET_ID}`);
    await expect(page.getByRole('button', { name: 'Download Dataset' })).toBeVisible({ timeout: 10000 });
    await page.context().setOffline(true);
    await expect(page.locator('#connection-status')).toContainText('Offline', { timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Download Dataset' })).toBeDisabled({ timeout: 10000 });
    await page.context().setOffline(false);
  });
});
