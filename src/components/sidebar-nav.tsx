"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { hasPermission, type Permission } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "◧" },
  { href: "/plans", label: "Plans", icon: "◈", permission: "plans:read" },
  { href: "/billing", label: "Billing", icon: "▤", permission: "billing:read" },
  { href: "/usage", label: "Usage", icon: "◔", permission: "analytics:read" },
  { href: "/team", label: "Team", icon: "◍", permission: "members:read" },
  { href: "/admin", label: "Admin", icon: "◆", permission: "analytics:read-any" },
];

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => !item.permission || hasPermission(role, item.permission)).map(
        (item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-emerald-500/15 font-medium text-emerald-300"
                  : "text-neutral-400 hover:bg-elevated hover:text-neutral-100"
              }`}
            >
              <span aria-hidden className="w-4 text-center">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        },
      )}
    </nav>
  );
}
