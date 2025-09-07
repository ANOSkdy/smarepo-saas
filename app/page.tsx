import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();

  if (session) {
    // ユーザーがログインしている場合、NFC打刻ページにリダイレクトします
    redirect('/nfc');
  } else {
    // ユーザーがログインしていない場合、ログインページにリダイレクトします
    redirect('/login');
  }
}