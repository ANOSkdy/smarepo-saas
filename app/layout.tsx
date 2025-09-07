import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import NextAuthSessionProvider from '@/components/SessionProvider'; // Import

const inter = Inter({ subsets: ['latin'] });

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
      <body className={`${inter.className} bg-base`}>
        <header className="w-full bg-white shadow-md">
          <div className="mx-auto max-w-4xl px-4 py-3">
            <h1 className="text-xl font-bold text-gray-800">スマレポ</h1>
          </div>
        </header>
        <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
      </body>
    </html>
  );
}