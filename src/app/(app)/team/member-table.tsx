"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import {
  changeRoleAction,
  removeMemberAction,
} from "@/app/(app)/team/actions";
import { Badge, EmptyState } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { can } from "@/lib/permissions";

type Member = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

function Status({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p
      role="status"
      className={`text-xs ${ok ? "text-emerald-300" : "text-red-300"}`}
    >
      {message}
    </p>
  );
}

function Row({
  member,
  currentUserId,
  currentRole,
  assignableRoles,
}: {
  member: Member;
  currentUserId: string;
  currentRole: Role;
  assignableRoles: Role[];
}) {
  const isSelf = member.id === currentUserId;
  const canEdit = can(currentRole, "members:update") && !isSelf;
  const canRemove = can(currentRole, "members:remove") && !isSelf;

  // A non-owner admin must not be able to touch owners.
  const lockedByOwner =
    member.role === "OWNER" && !can(currentRole, "org:delete");

  const [roleState, roleAction, rolePending] = useActionState<
    ActionState | null,
    FormData
  >(changeRoleAction, null);

  const [removeState, removeAction, removePending] = useActionState<
    ActionState | null,
    FormData
  >(removeMemberAction, null);

  return (
    <tr className={member.isActive ? "" : "opacity-50"}>
      <td className="py-3 pr-4">
        <p className="font-medium">
          {member.name ?? "—"}
          {isSelf && (
            <span className="ml-2 text-xs text-neutral-500">(you)</span>
          )}
        </p>
        <p className="text-xs text-neutral-500">{member.email}</p>
      </td>

      <td className="py-3 pr-4">
        <Badge tone={member.role === "OWNER" ? "green" : "neutral"}>
          {member.role}
        </Badge>
      </td>

      <td className="py-3 pr-4 text-xs text-neutral-400">
        {member.lastLoginAt
          ? new Date(member.lastLoginAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "never"}
      </td>

      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {member.isActive ? (
            <>
              <form action={roleAction} className="flex items-center gap-2">
                <input type="hidden" name="userId" value={member.id} />
                <select
                  name="role"
                  defaultValue={member.role}
                  disabled={!canEdit || lockedByOwner || rolePending}
                  aria-label={`Role for ${member.email}`}
                  className="rounded-md border border-line bg-elevated px-2 py-1 text-xs text-neutral-200 disabled:opacity-50"
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!canEdit || lockedByOwner || rolePending}
                  className="rounded-md border border-line px-2 py-1 text-xs text-neutral-300 transition hover:bg-elevated disabled:opacity-40"
                >
                  {rolePending ? "…" : "Save"}
                </button>
              </form>

              <form action={removeAction}>
                <input type="hidden" name="userId" value={member.id} />
                <button
                  type="submit"
                  disabled={!canRemove || lockedByOwner || removePending}
                  className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                >
                  {removePending ? "…" : "Remove"}
                </button>
              </form>
            </>
          ) : (
            <span className="text-xs text-neutral-600">inactive</span>
          )}
        </div>

        {(roleState || removeState) && (
          <div className="mt-1.5 space-y-0.5 text-right">
            {roleState && <Status ok={roleState.ok} message={roleState.message} />}
            {removeState && (
              <Status ok={removeState.ok} message={removeState.message} />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function MemberTable({
  members,
  currentUserId,
  currentRole,
  assignableRoles,
}: {
  members: Member[];
  currentUserId: string;
  currentRole: Role;
  assignableRoles: Role[];
}) {
  if (members.length === 0) {
    return <EmptyState>No members yet.</EmptyState>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="pb-2 pr-4 font-medium">Member</th>
            <th className="pb-2 pr-4 font-medium">Role</th>
            <th className="pb-2 pr-4 font-medium">Last seen</th>
            <th className="pb-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {members.map((m) => (
            <Row
              key={m.id}
              member={m}
              currentUserId={currentUserId}
              currentRole={currentRole}
              assignableRoles={assignableRoles}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
