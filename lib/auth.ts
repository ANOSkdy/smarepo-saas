import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { User } from 'next-auth';
import { usersTable } from '@/lib/airtable';
import { ROUTES } from '@/src/constants/routes';

const secret = process.env.NEXTAUTH_SECRET;
if (!secret) {
  console.error('NEXTAUTH_SECRET is not set');
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  secret,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) {
          return null;
        }

        try {
          const records = await usersTable
            .select({
              filterByFormula: `{username} = '${credentials.username}'`,
              maxRecords: 1,
            })
            .firstPage();

          const userRecord = records[0];
          if (!userRecord || !userRecord.fields.password) {
            console.error('User not found or password not set in Airtable');
            return null;
          }

          const isPasswordValid = credentials.password === userRecord.fields.password;

          if (isPasswordValid && userRecord.fields.active) {
            // The object returned here will be part of the `user` object in the `jwt` callback
            return {
              id: userRecord.id,
              name: userRecord.fields.name as string,
              email: userRecord.fields.username as string,
              role: userRecord.fields.role as string,
              userId: userRecord.fields.userId as string,
            } as User;
          }

          return null;
        } catch (error) {
          console.error('Authorize error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // User object is available on sign-in.
        token.id = user.id!;
        token.role = user.role!;
        token.userId = user.userId!;
      }
      return token;
    },
    session({ session, token }) {
      // Add custom properties to the session object
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.userId = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: ROUTES.LOGIN,
  },
  logger: {
    error(code, ...metadata) {
      console.error('Auth error', {
        code,
        metadata,
        secretPresent: Boolean(secret),
        secretLength: secret?.length,
      });
    },
  },
});
