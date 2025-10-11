declare module '@sparticuz/chromium' {
  type Chromium = {
    args: string[];
    executablePath(): Promise<string | null>;
    defaultViewport?: {
      width?: number;
      height?: number;
      deviceScaleFactor?: number;
    };
    headless?: boolean | 'new';
  };

  const chromium: Chromium;
  export default chromium;
  export type { Chromium };
}
