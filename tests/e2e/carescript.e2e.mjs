import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright-core';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 4173;
      srv.close(() => resolve(port));
    });
  });
}

let baseUrl = 'http://127.0.0.1:4173';

function resolveBrowserExecutable() {
  const candidates = [
    process.env.CARESCRIPT_BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function waitForServer(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for Vite preview server at ${url}`);
}

let serverProc = null;
let browser = null;
const consoleErrors = [];
const pageErrors = [];

before(async () => {
  const distIndex = path.resolve('frontend/dist/index.html');
  if (!fs.existsSync(distIndex)) {
    throw new Error('frontend/dist/index.html missing. Run `npm run build` before `npm run test:e2e`.');
  }

  const executablePath = resolveBrowserExecutable();
  if (!executablePath) {
    throw new Error(
      'No Chrome or Edge executable found for E2E browser testing. Set CARESCRIPT_BROWSER_PATH or install Chrome/Edge.'
    );
  }

  const previewPort = await getFreePort();
  baseUrl = `http://127.0.0.1:${previewPort}`;
  const viteBin = path.resolve('frontend/node_modules/vite/bin/vite.js');
  serverProc = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(previewPort), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: path.resolve('frontend'),
      stdio: 'ignore',
    }
  );

  await waitForServer(baseUrl);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
});

after(async () => {
  if (browser) {
    await Promise.race([
      browser.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  if (serverProc && serverProc.pid) {
    try {
      serverProc.kill('SIGKILL');
    } catch {
      // Ignore
    }
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(serverProc.pid), '/f', '/t'], {
          stdio: 'ignore',
          timeout: 3000,
        });
      } catch {
        // Ignore if already exited
      }
    }
  }
});

test('Auth screen handles OAuth errors and does not expose demo login', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. OAuth cancellation returns to a usable sign-in screen instead of a spinner/blank page.
    await page.goto(`${baseUrl}/auth/callback?error=access_denied&error_description=Login%20cancelled`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('alert').getByText(/Login cancelled/i).waitFor({ timeout: 10_000 });
    await page.getByRole('heading', { name: /Welcome back/i }).waitFor();

    // Auth screen should only offer the configured account sign-in methods.
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Welcome back/i }).waitFor({ timeout: 10_000 });
    assert.equal(await page.getByRole('button', { name: /Continue with Sample Demo Patient/i }).count(), 0);
    assert.equal(await page.getByText(/Secured with Supabase Auth/i).count(), 0);
    assert.equal(await page.getByText(/OR TRY WITH SAMPLE DATA/i).count(), 0);

    // Email validation check
    await page.getByLabel('Email Address').fill('invalid-email');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.getByRole('alert').getByText(/Please enter a valid email address/i).waitFor();

    // Capture the OAuth authorization request locally instead of contacting Google.
    // This verifies the deployed code derives redirect_to from the current origin.
    const googleButton = page.getByRole('button', { name: /Continue with Google/i });
    if (await googleButton.count()) {
      let authorizeRequestUrl = '';
      await page.route('**/auth/v1/authorize**', async (route) => {
        authorizeRequestUrl = route.request().url();
        await route.fulfill({ status: 200, contentType: 'text/html', body: 'OAuth request captured for test.' });
      });
      await googleButton.click();
      await page.waitForURL(/\/auth\/v1\/authorize/);
      assert.equal(
        new URL(authorizeRequestUrl).searchParams.get('redirect_to'),
        `${baseUrl}/auth/callback`
      );
    }

    assert.deepEqual(pageErrors, [], `Uncaught page errors observed: ${pageErrors.join('; ')}`);
    assert.deepEqual(consoleErrors, [], `Browser console errors observed: ${consoleErrors.join('; ')}`);
  } finally {
    await Promise.race([
      context.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
});
