import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export default auth((req) => {
  const request = req as unknown as NextRequest;
  const url = request.nextUrl.clone();
  if (url.pathname.startsWith('/nfc')) {
    if (!url.searchParams.has('machineId')) {
      url.searchParams.set('machineId', '1001');
      return NextResponse.rewrite(url);
    }
  }
  return NextResponse.next();
});

// この設定で、どのページを認証保護の対象にするかを定義します
export const config = {
  matcher: [
    /*
     * 以下のパスを除く、すべてのリクエストパスを認証の対象とする
     * - /api/ (APIルート)
     * - /_next/static (静的ファイル)
     * - /_next/image (画像最適化ファイル)
     * - /favicon.ico (ファビコンファイル)
     * - /login (ログインページ)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
  ],
};
