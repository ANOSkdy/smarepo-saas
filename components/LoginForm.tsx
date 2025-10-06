'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import A11yButton from './A11yButton';

export default function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') ?? '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = (await signIn('credentials', {
        redirect: true,
        callbackUrl,
        username,
        password,
      })) as { error?: string } | undefined;

      if (result?.error) {
        setError('IDまたはパスワードが正しくありません');
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError('ログイン中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const errorId = error ? 'login-error' : undefined;
  const usernameDescribedBy = ['username-hint', errorId].filter(Boolean).join(' ') || undefined;
  const passwordDescribedBy = ['password-hint', errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="container-p flex min-h-[calc(100svh-80px)] items-center justify-center">
      <div className="card w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div className="space-y-2">
            <h1 data-testid="login-title" className="text-2xl font-bold text-brand-text">
              ログイン
            </h1>
            <p className="text-sm text-brand-muted">
              発行済みのIDとパスワードを入力してサインインしてください。
            </p>
          </div>
          {error ? (
            <div
              id="login-error"
              role="alert"
              className="rounded-lg border border-brand-error/40 bg-brand-error/10 px-4 py-3 text-sm font-semibold text-brand-error"
            >
              {error}
            </div>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-semibold text-brand-text">
              ID
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              aria-describedby={usernameDescribedBy}
              aria-invalid={Boolean(error)}
              className="w-full rounded-lg border border-brand-border bg-brand-surface-alt px-3 py-2 text-brand-text shadow-sm"
            />
            <p id="username-hint" className="text-sm text-brand-muted">
              会社から共有されたIDを入力してください。
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-semibold text-brand-text">
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              aria-describedby={passwordDescribedBy}
              aria-invalid={Boolean(error)}
              className="w-full rounded-lg border border-brand-border bg-brand-surface-alt px-3 py-2 text-brand-text shadow-sm"
            />
            <p id="password-hint" className="text-sm text-brand-muted">
              大文字・小文字を区別して入力してください。
            </p>
          </div>
          <A11yButton type="submit" disabled={isLoading} aria-busy={isLoading} className="w-full justify-center text-base">
            {isLoading ? 'ログイン中…' : 'ログイン'}
          </A11yButton>
        </form>
      </div>
    </div>
  );
}