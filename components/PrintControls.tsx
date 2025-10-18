'use client';

import { useCallback } from 'react';

type PrintControlsProps = {
  className?: string;
  title?: string;
};

export default function PrintControls({ className = '', title = '現場別集計' }: PrintControlsProps) {
  const handlePrint = useCallback(() => {
    const previousTitle = document.title;
    document.title = title;
    window.print();
    document.title = previousTitle;
  }, [title]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handlePrint}
        className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
      >
        印刷（A4縦）
      </button>
    </div>
  );
}
