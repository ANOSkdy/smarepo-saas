type Browser = { close(): Promise<void> } | unknown;

type ChromiumModule = {
  args: string[];
  executablePath: () => Promise<string>;
};

type PuppeteerModule = {
  launch: (options?: Record<string, unknown>) => Promise<Browser>;
};

export async function launch(): Promise<Browser> {
  const chromiumImport = (await import('@sparticuz/chromium')) as
    | ChromiumModule
    | { default: ChromiumModule };
  const puppeteerImport = (await import('puppeteer-core')) as
    | PuppeteerModule
    | { default: PuppeteerModule };

  const chromium =
    'default' in chromiumImport ? chromiumImport.default : chromiumImport;
  const puppeteer =
    'default' in puppeteerImport ? puppeteerImport.default : puppeteerImport;

  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: 'new',
  });
}
