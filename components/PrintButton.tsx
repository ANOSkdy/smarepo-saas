'use client';

import React from 'react';

type PrintButtonProps = {
  label?: string;
  className?: string;
};

/**
 * シンプルな印刷ボタン。クリックで window.print() を呼びます。
 * 画面上では表示し、印刷時は自動で非表示（.no-print）になります。
 */
export default function PrintButton({ label = 'PDF印刷', className = '' }: PrintButtonProps) {
  const handleClick = () => {
    try {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } catch {
      window.scrollTo({ top: 0 });
    }
    window.print();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`no-print inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-sm hover:opacity-90 ${className}`}
      aria-label="印刷（PDF）"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-12 0v4h12v-4H6Z"
          fill="currentColor"
        />
      </svg>
      {label}
    </button>
  );
}
