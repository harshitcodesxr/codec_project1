import type { Role } from "@prisma/client";

/**
 * Central role-based access control map.
 *
 * A role is a bundle of permissions; checking a permission (not a role)
 * keeps authorisation consistent across pages, route handlers and the UI.
 *
 * This module is intentionally free of server-only imports so client
 * components can use it to decide what to render.
 */
export const PERMISSIONS = {
  // Organization
  "org:read": "View organization settings",
  "org:update": "Update organization settings",
  "org:delete": "Delete the organization",

  // Members
  "members:read": "View members",
  "members:invite": "Invite new members",
  "members:update": "Change a member's role",
  "members:remove": "Remove a member",

  // Plans & subscription
  "plans:read": "View the plan catalog",
  "plans:manage": "Create, edit and archive plans",
  "subscription:read": "View the current subscription",
  "subscription:change": "Upgrade, downgrade or cancel",
  "subscription:read-any": "View any organization's subscription",

  // Billing
  "billing:read": "View invoices and payments",
  "billing:manage": "Update payment methods",
  "billing:read-any": "View any organization's invoices",

  // Analytics
  "analytics:read": "View usage analytics",
  "analytics:write": "Record metered usage",
  "analytics:read-any": "View any organization's analytics",

  // Platform
  "audit:read": "View the audit log",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    "org:read", "org:update", "org:delete",
    "members:read", "members:invite", "members:update", "members:remove",
    "plans:read", "plans:manage",
    "subscription:read", "subscription:change", "subscription:read-any",
    "billing:read", "billing:manage", "billing:read-any",
    "analytics:read", "analytics:write", "analytics:read-any",
    "audit:read",
  ],
  ADMIN: [
    "org:read", "org:update",
    "members:read", "members:invite", "members:update", "members:remove",
    "plans:read", "plans:manage",
    "subscription:read", "subscription:read-any",
    "billing:read", "billing:read-any",
    "analytics:read", "analytics:write", "analytics:read-any",
    "audit:read",
  ],
  // Can move money-adjacent objects but not manage people or the catalog.
  // Note: no `analytics:write` — billing consumes metered usage, it does not
  // report it, and metered usage feeds the invoice total.
  BILLING: [
    "org:read",
    "members:read",
    "plans:read",
    "subscription:read", "subscription:change", "subscription:read-any",
    "billing:read", "billing:manage", "billing:read-any",
    "analytics:read", "analytics:read-any",
  ],
  MEMBER: [
    "org:read",
    "plans:read",
    "subscription:read",
    "billing:read",
    "analytics:read",
  ],
  VIEWER: ["plans:read", "subscription:read", "analytics:read"],
};

/** Roles that may sign into the `/admin` console. */
export const ADMIN_ROLES: readonly Role[] = ["OWNER", "ADMIN", "BILLING"];

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

/** Safe client-side check for hiding UI the current role may not use. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return can(role, permission);
}
