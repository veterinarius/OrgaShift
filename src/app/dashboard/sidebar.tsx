"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";

const navItems = [
  { href: "/dashboard", label: "Übersicht" },
  { href: "/dashboard/mitarbeiter", label: "Mitarbeiter" },
  { href: "/dashboard/dienstplan", label: "Dienstplan" },
  { href: "/dashboard/einstellungen", label: "Einstellungen" },
];

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-col border-r border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 px-4 py-4">
        <h2 className="text-lg font-bold">OrgaShift</h2>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-4 py-3">
        <p className="truncate text-xs text-gray-500">{userEmail}</p>
        <form action={logout}>
          <button
            type="submit"
            className="mt-2 text-sm text-red-600 hover:underline"
          >
            Abmelden
          </button>
        </form>
      </div>
    </aside>
  );
}
