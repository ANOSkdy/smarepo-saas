import type { Chromium } from '@sparticuz/chromium';
import type { Browser, Puppeteer } from 'puppeteer-core';

const DEFAULT_VIEWPORT = { width: 1122, height: 793, deviceScaleFactor: 2 } as const;

let chromiumInstance: Promise<Chromium> | null = null;
let puppeteerInstance: Promise<Puppeteer> | null = null;

async function getChromium(): Promise<Chromium> {
  if (!chromiumInstance) {
    chromiumInstance = import('@sparticuz/chromium').then((module) => module.default);
  }
  return chromiumInstance;
}

async function getPuppeteer(): Promise<Puppeteer> {
  if (!puppeteerInstance) {
    puppeteerInstance = import('puppeteer-core').then((module) => module.default);
  }
  return puppeteerInstance;
}

export async function launch(): Promise<Browser> {
  const [chromium, puppeteer] = await Promise.all([getChromium(), getPuppeteer()]);
  const executablePath =
    (await chromium.executablePath()) || process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: DEFAULT_VIEWPORT,
    executablePath,
    headless: 'new',
  });
}

export async function close(browser: Browser | null | undefined): Promise<void> {
  if (!browser) {
    return;
  }
  await browser.close();
}
