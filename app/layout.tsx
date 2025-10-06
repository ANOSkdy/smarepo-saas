import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import NextAuthSessionProvider from '@/components/SessionProvider';
import SkipLink from '@/components/SkipLink';

export const metadata: Metadata = {
  title: 'AI日報「スマレポ」',
  description: 'NFCを使ったAI日報システム',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-brand-surface text-brand-text">
        <SkipLink />
        <header className="border-b border-brand-border bg-brand-surface-alt">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <p className="text-lg font-semibold">スマレポ</p>
            <nav aria-label="トップナビゲーション" role="navigation" className="flex flex-wrap gap-4 text-sm font-medium">
              <Link href="/dashboard" className="tap-target text-brand-primary hover:text-brand-primary/80">
                ダッシュボード
              </Link>
              <Link href="/nfc" className="tap-target text-brand-primary hover:text-brand-primary/80">
                NFC打刻
              </Link>
            </nav>
          </div>
        </header>
        <NextAuthSessionProvider>
          <main id="main" role="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 pt-6 sm:px-6">
            {children}
          </main>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
