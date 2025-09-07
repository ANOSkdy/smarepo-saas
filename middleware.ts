export { default } from 'next-auth/middleware';

// この設定により、指定したパスが保護対象となります
export const config = {
  matcher: ['/nfc/:path*'],
};