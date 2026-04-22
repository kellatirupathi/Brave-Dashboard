// Centralised role-check helpers. "superadmin" is a singleton role that has
// every admin permission plus the exclusive ability to add / modify / delete
// other admins (and to be transferred to another user).
export type Role = "student" | "coordinator" | "admin" | "superadmin";

export function isAdminRole(role: string | undefined | null): boolean {
  return role === "admin" || role === "superadmin";
}

export function isSuperadminRole(role: string | undefined | null): boolean {
  return role === "superadmin";
}

// Staff = anyone with operational power over teams (coordinator + admin + superadmin).
export function isStaffRole(role: string | undefined | null): boolean {
  return role === "coordinator" || role === "admin" || role === "superadmin";
}
