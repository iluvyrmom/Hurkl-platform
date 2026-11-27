import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="bg-brand-navy px-5 pb-6 pt-8 text-white">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-white/80">{subtitle}</p>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-brand-orange text-white active:bg-brand-orange-dark",
  secondary: "bg-brand-navy text-white active:bg-brand-navy-dark",
  outline: "border-2 border-brand-navy text-brand-navy active:bg-slate-100",
  ghost: "text-brand-navy active:bg-slate-100",
  danger: "bg-brand-danger text-white active:opacity-90",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  fullWidth?: boolean;
}) {
  return (
    <button
      className={`min-h-[52px] rounded-xl px-5 text-base font-semibold transition-colors disabled:opacity-50 ${
        BUTTON_VARIANTS[variant]
      } ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  fullWidth = false,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  fullWidth?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors ${
        BUTTON_VARIANTS[variant]
      } ${fullWidth ? "w-full" : ""}`}
    >
      {children}
    </Link>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-brand-slate">
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-brand-navy">{label}</span>
      {children}
    </label>
  );
}

export const inputClassName =
  "w-full min-h-[48px] rounded-lg border border-slate-300 px-3 text-base focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/30";
