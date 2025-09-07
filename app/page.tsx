import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session) {
    // ユーザーがログインしている場合、NFC打刻ページにリダイレクトします
    redirect('/nfc');
  } else {
    // ユーザーがログインしていない場合、ログインページにリダイレクトします
    redirect('/login');
  }
}