"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print w-full text-center text-sm font-semibold text-brand-navy underline"
    >
      Print quote
    </button>
  );
}
