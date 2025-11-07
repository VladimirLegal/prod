const puppeteer = require('puppeteer');

const MAX_CONCURRENCY = Number(process.env.PDF_BROWSER_CONCURRENCY || 4);
const PAGE_ACQUIRE_TIMEOUT_MS = Number(process.env.PDF_PAGE_ACQUIRE_TIMEOUT_MS || 15000);
const RENDER_TIMEOUT_MS = Number(process.env.PDF_RENDER_TIMEOUT_MS || 30000);

const launchOptions = {
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
};

if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
}

function annotateMissingDependencies(error) {
  if (!error) {
    return error;
  }

  const message = typeof error.message === 'string' ? error.message : String(error);
  if (message && message.includes('libatk-1.0.so.0')) {
    const hint =
      'Puppeteer requires the libatk1.0-0 system library. Install it with "apt-get install -y libatk1.0-0" or the equivalent package for your platform.';
    if (typeof error.message === 'string') {
      error.message = `${message}\n\n${hint}`;
    } else {
      error.message = `${message}\n\n${hint}`;
    }
  }

  return error;
}

let browserPromise = null;
const semaphore = {
  active: 0,
  queue: [],
};

function withTimeout(promise, timeout, message) {
  if (!timeout) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${timeout} ms`));
    }, timeout);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function acquireSemaphore() {
  if (MAX_CONCURRENCY <= 0) {
    return () => {};
  }

  return new Promise((resolve) => {
    const attempt = () => {
      if (semaphore.active < MAX_CONCURRENCY) {
        semaphore.active += 1;
        resolve(releaseSemaphore);
        return;
      }
      semaphore.queue.push(attempt);
    };

    attempt();
  });
}

function releaseSemaphore() {
  semaphore.active = Math.max(0, semaphore.active - 1);
  const next = semaphore.queue.shift();
  if (next) {
    next();
  }
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch(launchOptions)
      .then((browser) => {
        browser.on('disconnected', () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        browserPromise = null;
        throw annotateMissingDependencies(error);
      });
  }
  return browserPromise;
}

async function restartBrowser() {
  if (!browserPromise) {
    return;
  }

  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (error) {
    // ignore closing errors
  } finally {
    browserPromise = null;
  }
}

async function safeClose(page) {
  if (!page) {
    return;
  }

  try {
    await page.close({ runBeforeUnload: false });
  } catch (error) {
    // ignore page close errors
  }
}

async function runWithPage(task, { renderTimeout = RENDER_TIMEOUT_MS, pageAcquireTimeout = PAGE_ACQUIRE_TIMEOUT_MS } = {}) {
  const release = await acquireSemaphore();
  let page;
  let needRestart = false;

  try {
    const browser = await getBrowser();
    page = await withTimeout(browser.newPage(), pageAcquireTimeout, 'Timed out creating a new page');
    page.setDefaultNavigationTimeout(renderTimeout);
    page.setDefaultTimeout(renderTimeout);

    return await withTimeout(
      Promise.resolve().then(() => task(page)),
      renderTimeout,
      'PDF render timed out'
    );
  } catch (error) {
    needRestart = true;
    throw error;
  } finally {
    await safeClose(page);
    release();
    if (needRestart) {
      await restartBrowser();
    }
  }
}

module.exports = {
  runWithPage,
  restartBrowser,
  getBrowser,
};