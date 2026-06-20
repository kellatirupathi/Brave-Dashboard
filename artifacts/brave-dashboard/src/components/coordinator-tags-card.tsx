import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Tags, Plus, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import {
  listCoordinatorTags,
  createCoordinatorTag,
  renameCoordinatorTag,
  deleteCoordinatorTag,
  type CoordinatorTag,
} from "@/lib/coordinator-tags-api";

export const COORDINATOR_TAGS_QUERY_KEY = ["coordinator-tags"] as const;

export function CoordinatorTagsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tags, isLoading } = useQuery({
    queryKey: COORDINATOR_TAGS_QUERY_KEY,
    queryFn: listCoordinatorTags,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editTarget, setEditTarget] = useState<CoordinatorTag | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CoordinatorTag | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: COORDINATOR_TAGS_QUERY_KEY });

  const createMut = useMutation({
    mutationFn: (name: string) => createCoordinatorTag(name),
    onSuccess: () => {
      toast({ title: "Tag added" });
      setAddOpen(false);
      setNewName("");
      invalidate();
    },
    onError: (e: unknown) =>
      toast({
        title: "Couldn't add tag",
        description: normalizeError(e).message,
        variant: "destructive",
      }),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameCoordinatorTag(id, name),
    onSuccess: () => {
      toast({ title: "Tag updated" });
      setEditTarget(null);
      invalidate();
    },
    onError: (e: unknown) =>
      toast({
        title: "Couldn't update tag",
        description: normalizeError(e).message,
        variant: "destructive",
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCoordinatorTag(id),
    onSuccess: () => {
      toast({ title: "Tag deleted" });
      setDeleteTarget(null);
      invalidate();
      // Assignments may have changed (cascade) — refresh the Users column data.
      queryClient.invalidateQueries({
        queryKey: ["coordinator-tag-assignments"],
      });
    },
    onError: (e: unknown) =>
      toast({
        title: "Couldn't delete tag",
        description: normalizeError(e).message,
        variant: "destructive",
      }),
  });

  return (
    <Card data-testid="card-coordinator-tags">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Tags className="w-5 h-5 text-primary" /> Coordinator Tags
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Functional tags for campus-coordinator accounts. Assign them to
            coordinators from the Users page.
          </p>
        </div>
        <Button
          size="icon"
          variant="outline"
          onClick={() => {
            setNewName("");
            setAddOpen(true);
          }}
          title="Add tag"
          aria-label="Add tag"
          data-testid="button-add-coordinator-tag"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Spinner />
          </div>
        ) : !tags || tags.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No tags yet. Use the + button to add one.
          </p>
        ) : (
          <ul className="divide-y">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center justify-between py-2"
                data-testid={`coordinator-tag-${tag.id}`}
              >
                <Badge variant="secondary">{tag.name}</Badge>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditTarget(tag);
                      setEditName(tag.name);
                    }}
                    title="Rename"
                    aria-label={`Rename ${tag.name}`}
                    data-testid={`button-edit-coordinator-tag-${tag.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(tag)}
                    title="Delete"
                    aria-label={`Delete ${tag.name}`}
                    data-testid={`button-delete-coordinator-tag-${tag.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Add tag dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add coordinator tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tag name</label>
            <Input
              autoFocus
              value={newName}
              placeholder="e.g. Success Coach"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim() && !createMut.isPending)
                  createMut.mutate(newName.trim());
              }}
              data-testid="input-new-coordinator-tag"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate(newName.trim())}
              disabled={!newName.trim() || createMut.isPending}
              data-testid="button-save-new-coordinator-tag"
            >
              {createMut.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename tag dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Rename tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tag name</label>
            <Input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  editTarget &&
                  editName.trim() &&
                  !renameMut.isPending
                )
                  renameMut.mutate({
                    id: editTarget.id,
                    name: editName.trim(),
                  });
              }}
              data-testid="input-edit-coordinator-tag"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editTarget &&
                renameMut.mutate({ id: editTarget.id, name: editName.trim() })
              }
              disabled={!editName.trim() || renameMut.isPending}
              data-testid="button-save-edit-coordinator-tag"
            >
              {renameMut.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete tag?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove{" "}
            <span className="font-semibold text-foreground">
              {deleteTarget?.name}
            </span>{" "}
            from the catalog and unassign it from any coordinators who currently
            have it. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
              data-testid="button-confirm-delete-coordinator-tag"
            >
              {deleteMut.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
