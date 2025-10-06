import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

// Suspenseで待っている間に表示するシンプルなローディングUI
function LoadingFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center" role="status" aria-live="polite">
      <p className="text-brand-muted">読み込み中...</p>
    </div>
  );
}

// ページ自体はサーバーコンポーネントとして定義
export default function LoginPage() {
  return (
    // `useSearchParams` を使っている LoginForm を Suspense でラップする
    <Suspense fallback={<LoadingFallback />}>
      <LoginForm />
    </Suspense>
  );
}