'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        redirect: false, // ページ遷移を自身でコントロールするため
        username,
        password,
      });

      if (result?.error) {
        setError('IDまたはパスワードが正しくありません');
      } else if (result?.ok) {
        // 現在のページのクエリパラメータを取得
        const params = new URLSearchParams(searchParams.toString());
        const queryString = params.toString();

        // リダイレクト先URLを構築
        const destination = `/nfc${queryString ? `?${queryString}` : ''}`;
        router.push(destination);
      }
    } catch (err) {
        console.error("Login failed:", err); // エラー内容をログに出力
      setError('ログイン中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-61px)] items-center justify-center bg-base">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <p className="rounded-md border border-accent-2/50 bg-accent-2/10 p-3 text-center font-bold text-accent-2">
              {error}
            </p>
          )}
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700"
            >
              ID
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-primary px-4 py-2 text-lg font-bold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}