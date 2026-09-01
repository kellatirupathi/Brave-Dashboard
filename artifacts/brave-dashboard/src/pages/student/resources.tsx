// Student-facing Resources library.
// - Read-only view of all resources (admin-curated + peer-shared).
// - Students can share their own resources (full CRUD over their own rows
//   only). Resources created by other users are view-only.
// - Each card shows the author name + role so students can tell admin-curated
//   docs apart from peer guides.

import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  BookOpen,
  Search,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";

type Resource = {
  id: number;
  title: string;
  description: string;
  docUrl: string;
  createdById: string;
  authorName: string | null;
  authorRole: "student" | "coordinator" | "admin" | null;
};

type FormState = {
  title: string;
  description: string;
  docUrl: string;
};

const emptyForm: FormState = { title: "", description: "", docUrl: "" };

export default function StudentResourcesLibrary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.authorName ?? "").toLowerCase().includes(q),
    );
  }, [resources, query]);

  const loadResources = async () => {
    try {
      const r = await fetch("/api/resources", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load resources");
      const data = (await r.json()) as Resource[];
      setResources(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load resources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/resources", { credentials: "include" });
        if (!r.ok) throw new Error("Failed to load resources");
        const data = (await r.json()) as Resource[];
        if (!cancelled) setResources(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const startEdit = (r: Resource) => {
    setEditingId(r.id);
    setForm({ title: r.title, description: r.description, docUrl: r.docUrl });
    setDialogOpen(true);
  };

  const closeDialog = (open: boolean) => {
    if (submitting) return;
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setForm(emptyForm);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const title = form.title.trim();
    const description = form.description.trim();
    const docUrl = form.docUrl.trim();
    if (!title || !description || !docUrl) {
      toast({
        title: "Missing fields",
        description: "Title, description and doc URL are all required.",
        variant: "destructive",
      });
      return;
    }
    try {
      const proto = new URL(docUrl).protocol;
      if (proto !== "http:" && proto !== "https:") {
        throw new Error("scheme");
      }
    } catch {
      toast({
        title: "Invalid URL",
        description: "Doc link must start with http:// or https://",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const isEdit = editingId !== null;
      const url = isEdit ? `/api/resources/${editingId}` : "/api/resources";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, docUrl }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Save failed");
      }
      toast({ title: isEdit ? "Resource updated" : "Resource shared" });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      await loadResources();
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      const res = await fetch(`/api/resources/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Delete failed");
      }
      toast({ title: "Resource deleted" });
      await loadResources();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const canManage = (r: Resource): boolean =>
    !!user && String(r.createdById) === String(user.id);

  return (
    <div className="mx-auto max-w-5xl px-0 py-0 sm:px-4 sm:py-6 md:py-8">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="mobile-page-heading">
          <h1
            className="text-2xl md:text-3xl font-bold tracking-tight"
            data-testid="text-resources-title"
          >
            Resources
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curated playbooks plus guides shared by fellow students. Click
            "Open" to read the full doc, or share one of your own.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          {!loading && resources.length > 0 && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search resources…"
                className="pl-9"
                data-testid="input-resources-search"
              />
            </div>
          )}
          <Button
            onClick={startCreate}
            className="gap-2 shrink-0"
            data-testid="button-share-resource"
          >
            <Plus className="w-4 h-4" />
            Share a resource
          </Button>
        </div>
      </div>

      {loading ? (
        <div
          className="flex items-center justify-center py-16"
          data-testid="resources-loading"
        >
          <Spinner className="size-6" />
        </div>
      ) : error ? (
        <div
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive"
          role="alert"
          data-testid="resources-error"
        >
          {error}
        </div>
      ) : resources.length === 0 ? (
        <div
          className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground"
          data-testid="resources-empty"
        >
          <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
          No resources have been shared yet. Be the first to share one!
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground"
          data-testid="resources-no-match"
        >
          No resources match{" "}
          <span className="font-medium text-foreground">"{query}"</span>.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((r) => {
            const isExpanded = expandedId === r.id;
            const isAdminCurated = r.authorRole === "admin";
            const mine = canManage(r);
            return (
              <article
                key={r.id}
                data-testid={`resource-${r.id}`}
                className="rounded-2xl border border-border bg-card p-5 md:p-6 flex flex-col gap-4 md:gap-5 transition-all duration-200 hover:border-[#C0392B]/30 hover:shadow-[0_12px_32px_-16px_rgba(192,57,43,0.18)]"
              >
                <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <h3
                        className="font-semibold text-base md:text-lg text-foreground"
                        data-testid={`resource-title-${r.id}`}
                      >
                        {r.title}
                      </h3>
                      {isAdminCurated ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          <ShieldCheck className="w-3 h-3" /> Official
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          <UserCircle className="w-3 h-3" /> Shared by{" "}
                          {r.authorName ?? "a student"}
                        </span>
                      )}
                      {mine && (
                        <span className="inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                          You
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-sm text-muted-foreground leading-relaxed ${
                        isExpanded ? "" : "line-clamp-2"
                      }`}
                      data-testid={`resource-description-${r.id}`}
                    >
                      {r.description}
                    </p>
                    {r.description.length > 120 && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="mt-1.5 text-xs font-semibold hover:underline"
                        style={{ color: "#C0392B" }}
                        data-testid={`resource-toggle-${r.id}`}
                      >
                        {isExpanded ? "Show less" : "Read more..."}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={r.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/btn inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#111] text-white transition-all duration-200 hover:bg-black hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.4)]"
                      style={{
                        boxShadow:
                          "0 4px 12px -4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
                      }}
                      data-testid={`resource-open-${r.id}`}
                    >
                      Open
                      <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                    </a>
                    {mine && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => startEdit(r)}
                          aria-label="Edit"
                          data-testid={`resource-edit-${r.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setDeleteId(r.id)}
                          aria-label="Delete"
                          className="text-destructive hover:text-destructive"
                          data-testid={`resource-delete-${r.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Add / Edit modal */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent
          className="sm:max-w-lg"
          data-testid="student-resource-form"
        >
          <DialogHeader>
            <DialogTitle>
              {editingId !== null ? "Edit your resource" : "Share a resource"}
            </DialogTitle>
            <DialogDescription>
              {editingId !== null
                ? "Update the title, description, or document link."
                : "Share a guide, playbook, or doc that helped your team — other students will see it here."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="student-resource-title">Title</Label>
              <Input
                id="student-resource-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={200}
                required
                disabled={submitting}
                data-testid="input-student-resource-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="student-resource-description">Description</Label>
              <Textarea
                id="student-resource-description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                maxLength={2000}
                rows={5}
                required
                disabled={submitting}
                placeholder="What's inside? Who is it for?"
                data-testid="input-student-resource-description"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="student-resource-doc-url">
                Doc link (Google Docs / Notion / etc.)
              </Label>
              <Input
                id="student-resource-doc-url"
                type="url"
                value={form.docUrl}
                onChange={(e) => setForm({ ...form, docUrl: e.target.value })}
                placeholder="https://docs.google.com/..."
                maxLength={1000}
                required
                disabled={submitting}
                data-testid="input-student-resource-doc-url"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => closeDialog(false)}
                disabled={submitting}
                data-testid="button-student-resource-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="gap-2"
                data-testid="button-student-resource-submit"
              >
                {submitting && <Spinner className="w-4 h-4" />}
                {editingId !== null ? "Save changes" : "Share resource"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this resource?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the resource for everyone. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-student-resource-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
