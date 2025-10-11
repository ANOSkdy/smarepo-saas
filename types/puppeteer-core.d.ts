declare module 'puppeteer-core' {
  export type PDFMargin = {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };

  export type PDFOptions = {
    format?: string;
    landscape?: boolean;
    printBackground?: boolean;
    margin?: PDFMargin;
  };

  export type LaunchViewport = {
    width?: number;
    height?: number;
    deviceScaleFactor?: number;
  };

  export type LaunchOptions = {
    args?: string[];
    defaultViewport?: LaunchViewport;
    executablePath?: string;
    headless?: boolean | 'new';
  };

  export interface Page {
    setContent(html: string, options?: { waitUntil?: 'networkidle0' | 'load' | 'domcontentloaded' }): Promise<void>;
    pdf(options?: PDFOptions): Promise<Buffer>;
    close(): Promise<void>;
  }

  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export interface Puppeteer {
    launch(options?: LaunchOptions): Promise<Browser>;
  }

  const puppeteer: Puppeteer;
  export default puppeteer;
  export type { Puppeteer };
}
