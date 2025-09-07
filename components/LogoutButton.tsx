'use client';

import { signOut } from 'next-auth/react';

export default function LogoutButton() {
  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
    <button
      onClick={handleLogout}
      className="mt-4 text-sm text-gray-600 hover:text-gray-900 hover:underline"
    >
      ログアウト
    </button>
  );
}