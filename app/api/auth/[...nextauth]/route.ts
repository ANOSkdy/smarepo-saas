import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { usersTable } from '@/lib/airtable';
import bcrypt from 'bcryptjs';
import { UserFields } from '@/types';

// NextAuthの設定
export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      // 認証ロジック
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) {
          return null;
        }

        try {
          // 1. Airtableからユーザーを検索
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

          // 2. パスワードを比較 (Airtableにはハッシュ化されたパスワードを保存する想定)
          // ※現状は平文なので、まずは平文で比較します。
          // const isPasswordValid = await bcrypt.compare(
          //   credentials.password,
          //   userRecord.fields.password
          // );
          const isPasswordValid = credentials.password === userRecord.fields.password;

          if (isPasswordValid && userRecord.fields.active) {
            // 3. 認証成功。セッションに含める情報を返す
            return {
              id: userRecord.id,
              name: userRecord.fields.name,
              userId: userRecord.fields.userId, // ### 変更点 1 ###
              email: userRecord.fields.username, // emailの代わりにusernameを使用
              role: userRecord.fields.role,
            };
          }

          return null; // パスワードが違うか、ユーザーが非アクティブ
        } catch (error) {
          console.error('Authorize error:', error);
          return null;
        }
      },
    }),
  ],
  // セッション管理の設定
  callbacks: {
    // JWTトークンにカスタム情報を追加
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        // @ts-ignore
        token.userId = user.userId; // ### 変更点 2 ###
      }
      return token;
    },
    // セッションオブジェクトにカスタム情報を追加
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        // @ts-ignore
        session.user.userId = token.userId as string; // ### 変更点 3 ###
      }
      return session;
    },
  },
  pages: {
    signIn: '/login', // ログインページのパス
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// NextAuthハンドラをエクスポート
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };