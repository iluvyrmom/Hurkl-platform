"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseIcon,
  CalendarIcon,
  HomeIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
} from "./icons";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/new-estimate", label: "New", icon: PlusIcon },
  { href: "/schedule", label: "Schedule", icon: CalendarIcon },
  { href: "/jobs", label: "Jobs", icon: BriefcaseIcon },
  { href: "/customers", label: "Customers", icon: UsersIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-6">
        {NAV_ITEMS.map(({ href, label, icon: ItemIcon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  active ? "text-brand-orange" : "text-brand-slate"
                }`}
              >
                <ItemIcon className="h-5 w-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
