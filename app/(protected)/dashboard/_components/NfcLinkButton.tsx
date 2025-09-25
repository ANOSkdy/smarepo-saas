'use client';

import Link from 'next/link';

export default function NfcLinkButton() {
  return (
    <Link
      href="/nfc"
      prefetch
      className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
      aria-label="打刻ページへ"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 8a7 7 0 0 1 14 0v8a7 7 0 0 1-14 0Z" />
        <path d="M12 6v12" />
      </svg>
      打刻ページへ
    </Link>
  );
}
