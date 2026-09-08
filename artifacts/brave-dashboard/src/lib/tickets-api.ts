// Support tickets — client (additive, isolated).
//
// One module for both sides of the feature: the student who raises a ticket
// and the staff member who answers it read the same rows through the same
// types, so the two screens cannot drift apart in what they think a ticket is.
import { customFetch } from "@workspace/api-client-react";

export type TicketStatus = "open" | "in_progress" | "resolved";

// The tree itself lives in ticket-categories.ts — one definition for the
// student picker, the admin filter and the display labels.
export type { TicketCategory } from "./ticket-categories";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Closed",
};

export type Ticket = {
  id: number;
  publicId: string;
  seasonId: number;
  subject: string;
  description: string;
  category: string;
  /** The specific complaint within the category. */
  subcategory: string | null;
  attachments: string[] | null;
  status: TicketStatus;
  assignedTo: string | null;
  assignedAt: string | null;
  /** Sanitised HTML, written by staff. Safe to render. */
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  createdBy: string;
  creatorFirstName: string | null;
  creatorLastName: string | null;
  creatorEmail: string | null;
  creatorNiatId: string | null;
  campusName: string | null;
};

export type TicketsConfig = {
  permissions: { add: boolean; view: boolean; edit: boolean; delete: boolean };
  menuEnabled: boolean;
  isStaff: boolean;
  categories: string[];
};

export type TicketAssignee = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
};

/** Which staff tab is being shown. */
export type TicketScope = "active" | "closed" | "mine";

export type TicketFilters = {
  scope: TicketScope;
  search?: string;
  category?: string;
  from?: string;
  to?: string;
};

export const ticketKeys = {
  config: () => ["tickets-config"] as const,
  mine: () => ["tickets-mine"] as const,
  queue: (f: TicketFilters) =>
    [
      "tickets-queue",
      f.scope,
      f.search ?? "",
      f.category ?? "",
      f.from ?? "",
      f.to ?? "",
    ] as const,
  assignees: () => ["tickets-assignees"] as const,
  adminControl: () => ["tickets-admin-control"] as const,
};

export function getTicketsConfig(): Promise<TicketsConfig> {
  return customFetch("/api/tickets/config", { method: "GET" });
}

export function getMyTickets(): Promise<{ tickets: Ticket[] }> {
  return customFetch("/api/tickets/mine", { method: "GET" });
}

export function createTicket(body: {
  subject: string;
  description: string;
  category: string;
  subcategory: string;
  attachments?: string[];
}): Promise<{ ticket: Ticket }> {
  return customFetch("/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getTicketQueue(f: TicketFilters): Promise<{
  tickets: Ticket[];
  counts: { active: number; closed: number; mine: number };
}> {
  const params = new URLSearchParams({ scope: f.scope });
  if (f.search) params.set("search", f.search);
  if (f.category) params.set("category", f.category);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  return customFetch(`/api/tickets?${params.toString()}`, { method: "GET" });
}

export function getTicketAssignees(): Promise<{ assignees: TicketAssignee[] }> {
  return customFetch("/api/tickets/assignees", { method: "GET" });
}

/** Take a ticket, or hand it to `assignTo`. */
export function assignTicket(
  publicId: string,
  assignTo?: string,
): Promise<{ ticket: Ticket }> {
  return customFetch(`/api/tickets/${publicId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(assignTo ? { assignTo } : {}),
  });
}

/** Answer and close. `resolution` is HTML; the server sanitises it. */
export function resolveTicket(
  publicId: string,
  resolution: string,
): Promise<{ ticket: Ticket }> {
  return customFetch(`/api/tickets/${publicId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolution }),
  });
}

// ── Admin config (Config → Ticket Support) ──────────────────────────────────

export type TicketsControlState = {
  permissions: { add: boolean; view: boolean; edit: boolean; delete: boolean };
  menuEnabled: boolean;
};

export function getTicketsControl(): Promise<TicketsControlState> {
  return customFetch("/api/admin/tickets-control", { method: "GET" });
}

export function updateTicketsControl(
  body: TicketsControlState,
): Promise<TicketsControlState> {
  return customFetch("/api/admin/tickets-control", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * The short reference a person actually quotes. The full UUID is the
 * identifier; this is what fits on a card and in an email subject.
 */
export function ticketRef(publicId: string): string {
  return publicId.slice(0, 8).toUpperCase();
}
