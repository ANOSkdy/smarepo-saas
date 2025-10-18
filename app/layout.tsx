import type { Metadata } from 'next';
import './globals.css';
import './reports-print.css';
import NextAuthSessionProvider from '@/components/SessionProvider';
import SkipLink from '@/components/SkipLink';
import NavTabs from '@/components/NavTabs';

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
        <header className="sticky top-0 z-50 border-b border-brand-border bg-brand-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <p className="text-lg font-semibold text-brand-primary">スマレポ</p>
            <NavTabs />
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
