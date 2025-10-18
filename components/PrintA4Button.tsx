'use client';
import React from 'react';

/**
 * A4縦での印刷を想定した汎用ボタン。
 * - 依存なし（どのページにも差し込み可）
 * - onClickで window.print() を呼ぶのみ
 */
export default function PrintA4Button({
  label = 'PDF印刷',
  className = '',
}: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="A4縦でPDF印刷"
      className={
        className ||
        'rounded-md border px-3 py-1 text-sm hover:bg-gray-50 active:opacity-90'
      }
    >
      {label}
    </button>
  );
}
