import NextAuth, { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { usersTable } from '@/lib/airtable';

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
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
            return {
              id: userRecord.id,
              name: userRecord.fields.name,
              userId: userRecord.fields.userId,
              email: userRecord.fields.username,
              role: userRecord.fields.role,
            };
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
        token.id = user.id;
        token.role = user.role;
        // ### 修正点 1: 不要なコメントを削除 ###
        token.userId = user.userId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        // ### 修正点 2: 不要なコメントを削除 ###
        session.user.userId = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };