// Admin Resources management — full CRUD over the resources table.
// Layout: list of row-cards on the left, slide-in form on the right for
// create/edit. Admins can add, edit, update, and delete resources here.

import { useEffect, useState } from "react";
import { ExternalLink, Pencil, Trash2, Plus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
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

type Resource = {
  id: number;
  title: string;
  description: string;
  docUrl: string;
};

type FormState = {
  title: string;
  description: string;
  docUrl: string;
};

const emptyForm: FormState = { title: "", description: "", docUrl: "" };

export default function AdminResources() {
  const { toast } = useToast();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadResources = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/resources", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load resources");
      const data = (await res.json()) as Resource[];
      setResources(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({
        title: "Could not load resources",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const startEdit = (r: Resource) => {
    setEditingId(r.id);
    setForm({
      title: r.title,
      description: r.description,
      docUrl: r.docUrl,
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
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
      // basic URL sanity check on the client
      new URL(docUrl);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid Google Doc link.",
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
      toast({
        title: isEdit ? "Resource updated" : "Resource created",
      });
      cancelForm();
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
      // If we were editing the deleted one, close the form.
      if (editingId === deleteId) cancelForm();
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1
            className="text-2xl md:text-3xl font-bold tracking-tight"
            data-testid="text-admin-resources-title"
          >
            Resources
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curate the projects & solutions library shown to students and on the
            public landing page.
          </p>
        </div>
        {!showForm && (
          <Button
            onClick={startCreate}
            className="gap-2"
            data-testid="button-add-resource"
          >
            <Plus className="w-4 h-4" />
            Add resource
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        {/* Left: list */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="size-6" />
            </div>
          ) : resources.length === 0 ? (
            <div
              className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground"
              data-testid="admin-resources-empty"
            >
              <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
              No resources yet. Click "Add resource" to create the first one.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {resources.map((r) => {
                const isExpanded = expandedId === r.id;
                return (
                  <article
                    key={r.id}
                    data-testid={`admin-resource-${r.id}`}
                    className={`rounded-2xl border bg-card p-5 md:p-6 transition-all duration-200 ${
                      editingId === r.id
                        ? "border-[#C0392B]/40 shadow-[0_12px_32px_-16px_rgba(192,57,43,0.25)]"
                        : "border-border hover:border-[#C0392B]/25"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base md:text-lg mb-1.5 text-foreground">
                          {r.title}
                        </h3>
                        <p
                          className={`text-sm text-muted-foreground leading-relaxed ${
                            isExpanded ? "" : "line-clamp-2"
                          }`}
                        >
                          {r.description}
                        </p>
                        {r.description.length > 120 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : r.id)
                            }
                            className="mt-1.5 text-xs font-semibold hover:underline"
                            style={{ color: "#C0392B" }}
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
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#111] text-white transition-all duration-200 hover:bg-black"
                          data-testid={`admin-resource-open-${r.id}`}
                        >
                          Open
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => startEdit(r)}
                          aria-label="Edit"
                          data-testid={`admin-resource-edit-${r.id}`}
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
                          data-testid={`admin-resource-delete-${r.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: form */}
        {showForm && (
          <aside
            className="rounded-2xl border border-border bg-card p-6 h-fit lg:sticky lg:top-6"
            data-testid="admin-resource-form"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingId !== null ? "Edit resource" : "New resource"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="resource-title">Project title</Label>
                <Input
                  id="resource-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  maxLength={200}
                  required
                  disabled={submitting}
                  data-testid="input-resource-title"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resource-description">
                  Project description
                </Label>
                <Textarea
                  id="resource-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  maxLength={2000}
                  rows={5}
                  required
                  disabled={submitting}
                  data-testid="input-resource-description"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resource-doc-url">
                  Step-by-step plan doc link
                </Label>
                <Input
                  id="resource-doc-url"
                  type="url"
                  value={form.docUrl}
                  onChange={(e) => setForm({ ...form, docUrl: e.target.value })}
                  placeholder="https://docs.google.com/..."
                  maxLength={1000}
                  required
                  disabled={submitting}
                  data-testid="input-resource-doc-url"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="gap-2"
                  data-testid="button-resource-submit"
                >
                  {submitting && <Spinner className="w-4 h-4" />}
                  {editingId !== null ? "Save changes" : "Create resource"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelForm}
                  disabled={submitting}
                  data-testid="button-resource-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </aside>
        )}
      </div>

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
              data-testid="button-resource-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
