import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: '/login',
  },
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
    "/((?!api|_next/static|_next/image|favicon.ico|login).*)",
  ],
};