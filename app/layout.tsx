import type { Metadata } from 'next';
import './globals.css';
import NextAuthSessionProvider from '@/components/SessionProvider';
import SkipLink from '@/components/SkipLink';
import HeaderNav from '@/components/HeaderNav';

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
        <NextAuthSessionProvider>
          <header className="border-b border-brand-border bg-brand-surface-alt">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
              <p className="text-lg font-semibold">スマレポ</p>
              <HeaderNav />
            </div>
          </header>
          <main id="main" role="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 pt-6 sm:px-6">
            {children}
          </main>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
