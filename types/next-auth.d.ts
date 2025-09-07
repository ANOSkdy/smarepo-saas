import NextAuth, { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

// UserオブジェクトとJWTトークンに含めるカスタムプロパティを定義
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      userId: string;
      role: string;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    userId: string;
    role: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    userId: string;
    role: string;
  }
}