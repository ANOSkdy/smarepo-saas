'use client';

import { signOut } from 'next-auth/react';

export default function LogoutButton() {
  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
    <button
      onClick={handleLogout}
      type="button"
      className="tap-target mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary underline decoration-2 decoration-brand-primary/70 underline-offset-4 hover:text-brand-primary/80"
    >
      ログアウト
    </button>
  );
}