// Role documentation content model. Content files are plain data (no React)
// so they stay easy to edit; pages/docs/index.tsx renders them.
//
// Inline markup inside any text: **bold**, `code`, and → as-is.

export type DocRole = "student" | "coordinator" | "admin";
export type DocVersion = "1.0" | "2.0";

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "table"; columns: string[]; rows: string[][] }
  | {
      type: "callout";
      tone: "info" | "warn" | "success" | "danger";
      title?: string;
      text: string;
    }
  | { type: "steps"; items: { title: string; text?: string }[] }
  | { type: "checklist"; items: string[] }
  | { type: "cando"; can: string[]; cannot: string[] }
  | { type: "h3"; text: string };

export type DocSection = {
  id: string;
  title: string;
  /** Short kicker under the title, optional. */
  intro?: string;
  /** lucide icon key, see ICONS in pages/docs/index.tsx. */
  icon?: string;
  blocks: DocBlock[];
};

export type RoleDoc = {
  role: DocRole;
  version: DocVersion;
  title: string;
  subtitle: string;
  /** The sidebar this role actually sees in the dashboard, in order. */
  menu: string[];
  sections: DocSection[];
  updated: string;
};
