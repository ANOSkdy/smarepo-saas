import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: {
      id: string;
      role: string;
      userId: string;
    } & DefaultSession['user'];
  }

  interface User {
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
  }
}