import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PDFOptions } from 'puppeteer-core';
import { close, launch } from './chromium';

export type PdfRenderOptions = {
  landscape?: boolean;
  marginMM?: number;
};

let embeddedFontCss: string | null = null;

function loadFontCss(): string {
  if (embeddedFontCss !== null) {
    return embeddedFontCss;
  }
  const fontPath = join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Regular.otf');
  if (!existsSync(fontPath)) {
    embeddedFontCss = '';
    return embeddedFontCss;
  }
  const fontData = readFileSync(fontPath);
  const base64 = fontData.toString('base64');
  embeddedFontCss = `@font-face {\n  font-family: 'Noto Sans JP';\n  src: url('data:font/otf;base64,${base64}') format('opentype');\n  font-weight: 400;\n  font-style: normal;\n}\n`;
  return embeddedFontCss;
}

export function baseCss(): string {
  const fontFace = loadFontCss();
  return `
${fontFace}@page { size: A4 landscape; margin: 8mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Noto Sans JP', system-ui, sans-serif; font-size: 11px; margin: 0; padding: 0; }
h1 { font-size: 18px; margin-bottom: 4px; }
.grid { border-collapse: collapse; width: 100%; }
.grid th, .grid td { border: 1px solid #777; padding: 2px 4px; font-size: 10px; }
.grid thead th { background: #f5f5f5; }
.nowrap { white-space: nowrap; }
.right { text-align: right; }
.center { text-align: center; }
.subtitle { font-size: 12px; margin-bottom: 8px; }
.meta { margin-bottom: 12px; font-size: 11px; }
  `.trim();
}

export async function htmlToPdfBuffer(html: string, options?: PdfRenderOptions): Promise<Buffer> {
  const margin = options?.marginMM ?? 8;
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfOptions: PDFOptions = {
      format: 'A4',
      landscape: options?.landscape ?? true,
      printBackground: true,
      margin: {
        top: `${margin}mm`,
        bottom: `${margin}mm`,
        left: `${margin}mm`,
        right: `${margin}mm`,
      },
    };
    const buffer = await page.pdf(pdfOptions);
    await page.close();
    return buffer;
  } finally {
    await close(browser);
  }
}

export type ReportRow = {
  date: string;
  username: string;
  sitename: string;
  machinename?: string;
  workdescription?: string;
  hours: number;
};

export type HeaderInfo = {
  title: string;
  year: number;
  month: number;
  generatedAt: string;
  siteName?: string;
  userName?: string;
};
