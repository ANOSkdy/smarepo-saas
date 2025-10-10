import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { ROUTES } from '@/src/constants/routes';

export default async function Home() {
  const session = await auth();

  if (session) {
    // ユーザーがログインしている場合、打刻ページにリダイレクトします
    redirect('/nfc');
  } else {
    // ユーザーがログインしていない場合、ログインページにリダイレクトします
    redirect(ROUTES.LOGIN);
  }
}
