declare module 'puppeteer-core' {
  export type Browser = {
    close(): Promise<void>;
  };
  export type LaunchOptions = Record<string, unknown>;
  const puppeteer: {
    launch: (options?: LaunchOptions) => Promise<Browser>;
  };
  export default puppeteer;
}

declare module '@sparticuz/chromium' {
  export const args: string[];
  export function executablePath(): Promise<string>;
  const chromium: {
    args: string[];
    executablePath: () => Promise<string>;
  };
  export default chromium;
}
