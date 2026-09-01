import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Trash2,
  ImageIcon,
  Upload,
  X,
} from "lucide-react";
import { useRequestUploadUrl } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
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
import { JournalEditDialog } from "@/components/journal-edit-dialog";
import {
  getJournalStatus,
  getJournalForWeek,
  getJournalPermissions,
  listMyJournals,
  listOpenWeeks,
  submitJournal,
  deleteJournal,
  type WeeklyJournal,
} from "@/lib/progress-api";
import { successFeedback, errorFeedback } from "@/lib/haptics";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Journal() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [whatWeDid, setWhatWeDid] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextWeekPlan, setNextWeekPlan] = useState("");
  const [clientsVisited, setClientsVisited] = useState<string>("0");
  const [activeConversations, setActiveConversations] = useState<string>("0");
  const [projectsStarted, setProjectsStarted] = useState<string>("0");
  const [projectsClosed, setProjectsClosed] = useState<string>("0");
  // Optional images attached to this week's journal (object-storage URLs).
  const [images, setImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const requestUpload = useRequestUploadUrl();

  // Default to "current week" status (server picks the right open week).
  const { data: currentStatus, isLoading: loadingCurrent } = useQuery({
    queryKey: ["journal", "current-week"],
    queryFn: getJournalStatus,
  });

  const { data: openWeeks } = useQuery({
    queryKey: ["journal", "open-weeks"],
    queryFn: listOpenWeeks,
  });

  // The week the user has selected to view/edit (defaults to current).
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);

  // Deep link: /journal?week=<weekId> (from the dashboard week tracker) opens
  // that specific week directly.
  const search = useSearch();
  useEffect(() => {
    const wk = new URLSearchParams(search).get("week");
    if (wk) {
      const id = Number(wk);
      if (Number.isFinite(id) && id > 0) setSelectedWeekId(id);
    }
  }, [search]);

  useEffect(() => {
    if (selectedWeekId == null && currentStatus?.weekId) {
      setSelectedWeekId(currentStatus.weekId);
    }
  }, [currentStatus?.weekId, selectedWeekId]);

  // Fetch the journal for the selected week.
  const { data: weekData, isLoading: loadingWeek } = useQuery({
    queryKey: ["journal", "by-week", selectedWeekId],
    queryFn: () => getJournalForWeek(selectedWeekId!),
    enabled: selectedWeekId != null,
  });

  const { data: history } = useQuery({
    queryKey: ["journal", "mine"],
    queryFn: listMyJournals,
  });

  const { data: permissions } = useQuery({
    queryKey: ["journal", "permissions"],
    queryFn: getJournalPermissions,
  });

  const [editing, setEditing] = useState<WeeklyJournal | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const deleteMut = useMutation({
    mutationFn: deleteJournal,
    onSuccess: () => {
      successFeedback();
      toast({ title: "Journal deleted" });
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["progress-summary"] });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Decide whether the student is allowed to edit/delete a given past journal.
  // Open-week journals are always editable via the main form above; here we
  // gate the per-row Edit/Delete buttons on the past-week toggle.
  function canMutateRow(row: WeeklyJournal): boolean {
    if (!permissions) return false;
    if (permissions.allowPastWeekEdits) return true;
    // Even when toggle is off, allow editing the *currently open* week's row
    // for consistency with the main form.
    return row.weekStartDate === currentStatus?.weekStartDate;
  }

  // Pre-fill the form whenever a week's existing journal loads.
  useEffect(() => {
    if (weekData?.journal) {
      setWhatWeDid(weekData.journal.whatWeDid);
      setBlockers(weekData.journal.blockers ?? "");
      setNextWeekPlan(weekData.journal.nextWeekPlan ?? "");
      setClientsVisited(String(weekData.journal.clientsVisited ?? 0));
      setActiveConversations(String(weekData.journal.activeConversations ?? 0));
      setProjectsStarted(String(weekData.journal.projectsStarted ?? 0));
      setProjectsClosed(String(weekData.journal.projectsClosed ?? 0));
      setImages(weekData.journal.images ?? []);
    } else if (weekData && !weekData.journal) {
      // New week — clear the form.
      setWhatWeDid("");
      setBlockers("");
      setNextWeekPlan("");
      setClientsVisited("0");
      setActiveConversations("0");
      setProjectsStarted("0");
      setProjectsClosed("0");
      setImages([]);
    }
  }, [weekData?.journal, weekData?.weekId]);

  const submitMut = useMutation({
    mutationFn: submitJournal,
    onSuccess: () => {
      successFeedback();
      toast({ title: "Journal saved" });
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["progress-summary"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to submit",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const isImageFile = (file: File): boolean =>
    /^image\//.test(file.type) ||
    /\.(jpe?g|png|gif|webp|heic)$/i.test(file.name);

  const handleImageUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!isImageFile(file)) {
      toast({
        title: "Images only",
        description: "Please upload a JPG, PNG, GIF, or WEBP image.",
        variant: "destructive",
      });
      return;
    }
    if (images.length >= 10) {
      toast({
        title: "Limit reached",
        description: "You can attach up to 10 images per journal.",
        variant: "destructive",
      });
      return;
    }
    setUploadingImage(true);
    try {
      const presigned = await requestUpload.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      const putRes = await fetch(presigned.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload failed");
      setImages((prev) => [...prev, presigned.objectPath]);
    } catch {
      toast({
        title: "Upload failed",
        description: "Could not upload the image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = (url: string) =>
    setImages((prev) => prev.filter((u) => u !== url));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (whatWeDid.trim().length < 5) {
      toast({
        title: "Tell us at least 5 characters of what you did this week",
        variant: "destructive",
      });
      return;
    }
    if (selectedWeekId == null) {
      toast({ title: "Select a week first", variant: "destructive" });
      return;
    }
    const toCount = (s: string): number => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    submitMut.mutate({
      weekId: selectedWeekId,
      whatWeDid: whatWeDid.trim(),
      blockers: blockers.trim() || undefined,
      nextWeekPlan: nextWeekPlan.trim() || undefined,
      clientsVisited: toCount(clientsVisited),
      activeConversations: toCount(activeConversations),
      projectsStarted: toCount(projectsStarted),
      projectsClosed: toCount(projectsClosed),
      images: images.length > 0 ? images : undefined,
    });
  };

  const noOpenWeeks = !loadingCurrent && (!openWeeks || openWeeks.length === 0);

  const currentWeekId = currentStatus?.weekId ?? null;
  const isCurrentSelected = selectedWeekId === currentWeekId;
  const today = todayIso();

  const sortedHistory = useMemo(() => history ?? [], [history]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="mobile-page-heading">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpenCheck className="h-6 w-6 text-primary" />
          Weekly Journal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit on any day of the week — Monday through Sunday. Pick a week
          from the dropdown to view or edit its entry.
        </p>
      </div>

      {noOpenWeeks ? (
        <Card data-tour="journal-empty-state">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
            <p className="text-sm font-medium">No weeks are currently open</p>
            <p className="text-xs text-muted-foreground mt-1">
              Ask your admin to open the current week.
            </p>
          </CardContent>
        </Card>
      ) : loadingCurrent || loadingWeek ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-8" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle>
                  {weekData ? `Week ${weekData.weekNumber} journal` : "Journal"}
                </CardTitle>
                <CardDescription className="flex items-center gap-1 mt-1">
                  <Calendar className="w-4 h-4" />
                  {weekData?.weekStartDate} → {weekData?.weekEndDate}
                  {isCurrentSelected && (
                    <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">
                      Current
                    </Badge>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {weekData?.submitted ? (
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Submitted
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                    Pending
                  </Badge>
                )}
                <Select
                  value={selectedWeekId ? String(selectedWeekId) : ""}
                  onValueChange={(v) => setSelectedWeekId(Number(v))}
                >
                  <SelectTrigger
                    className="w-44"
                    data-testid="journal-week-picker"
                  >
                    <SelectValue placeholder="Pick a week" />
                  </SelectTrigger>
                  <SelectContent>
                    {(openWeeks ?? []).map((w) => {
                      const isCurrent =
                        w.startDate <= today && today <= w.endDate;
                      return (
                        <SelectItem key={w.id} value={String(w.id)}>
                          Week {w.weekNumber}
                          {isCurrent ? " · current" : ""}
                          <span className="text-muted-foreground ml-1 text-xs">
                            ({w.startDate.slice(5)} → {w.endDate.slice(5)})
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">
                  What did your team do this week?{" "}
                  <span className="text-red-500">*</span>
                </label>
                <Textarea
                  rows={4}
                  value={whatWeDid}
                  onChange={(e) => setWhatWeDid(e.target.value)}
                  placeholder="E.g., Met 5 prospective clients, closed 1 deal worth ₹3,000, finalized our pricing model"
                  maxLength={2000}
                  required
                  data-testid="journal-what"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">
                  Blockers (optional)
                </label>
                <Textarea
                  rows={3}
                  value={blockers}
                  onChange={(e) => setBlockers(e.target.value)}
                  placeholder="E.g., Cold outreach response rate is low; need help with messaging"
                  maxLength={2000}
                  data-testid="journal-blockers"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">
                  Plan for next week (optional)
                </label>
                <Textarea
                  rows={3}
                  value={nextWeekPlan}
                  onChange={(e) => setNextWeekPlan(e.target.value)}
                  placeholder="E.g., Switch to LinkedIn outreach, schedule 3 demos"
                  maxLength={2000}
                  data-testid="journal-next-plan"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(
                  [
                    {
                      label: "Clients visited",
                      value: clientsVisited,
                      setValue: setClientsVisited,
                      testId: "journal-clients-visited",
                    },
                    {
                      label: "Active conversations",
                      value: activeConversations,
                      setValue: setActiveConversations,
                      testId: "journal-active-conversations",
                    },
                    {
                      label: "Projects started",
                      value: projectsStarted,
                      setValue: setProjectsStarted,
                      testId: "journal-projects-started",
                    },
                    {
                      label: "Projects complete",
                      value: projectsClosed,
                      setValue: setProjectsClosed,
                      testId: "journal-projects-closed",
                    },
                  ] as const
                ).map((f) => (
                  <div key={f.label}>
                    <label className="text-xs font-medium block mb-1 text-muted-foreground">
                      {f.label}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      step={1}
                      inputMode="numeric"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={f.value}
                      onChange={(e) => f.setValue(e.target.value)}
                      data-testid={f.testId}
                    />
                  </div>
                ))}
              </div>

              {/* Optional images — e.g. a client / facility visit. Used when
                  shooting reels. JPG / PNG / GIF / WEBP, up to 10. */}
              <div>
                <label className="text-xs font-medium mb-1 flex items-center gap-1.5 text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" /> Photos (optional)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {images.map((url) => (
                    <div key={url} className="relative">
                      <img
                        src={url}
                        alt="Journal attachment"
                        className="h-20 w-20 rounded-md border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow"
                        aria-label="Remove image"
                        data-testid="journal-remove-image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {images.length < 10 && (
                    <label
                      className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent ${
                        uploadingImage ? "pointer-events-none opacity-60" : ""
                      }`}
                      data-testid="journal-add-image"
                    >
                      {uploadingImage ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Add
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          void handleImageUpload(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={submitMut.isPending || uploadingImage}
                  data-testid="journal-submit"
                >
                  {submitMut.isPending
                    ? "Saving…"
                    : weekData?.submitted
                      ? "Update journal"
                      : "Submit journal"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Past journals</CardTitle>
          <CardDescription>{sortedHistory.length} entries</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">
              No past journals yet.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedHistory.map((j) => (
                <div
                  key={j.id}
                  className="border rounded-lg p-4 hover:bg-accent/30"
                  data-testid={`journal-row-${j.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-medium flex items-center gap-1">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {j.weekStartDate} → {j.weekEndDate}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Submitted {new Date(j.submittedAt).toLocaleString()}
                      </span>
                      {canMutateRow(j) && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => setEditing(j)}
                            data-testid={`student-edit-journal-${j.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => setDeletingId(j.id)}
                            data-testid={`student-delete-journal-${j.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="whitespace-pre-wrap">
                      <span className="text-xs uppercase font-semibold text-muted-foreground">
                        What we did:{" "}
                      </span>
                      {j.whatWeDid}
                    </p>
                    {j.blockers && (
                      <p className="whitespace-pre-wrap">
                        <span className="text-xs uppercase font-semibold text-muted-foreground">
                          Blockers:{" "}
                        </span>
                        {j.blockers}
                      </p>
                    )}
                    {j.nextWeekPlan && (
                      <p className="whitespace-pre-wrap">
                        <span className="text-xs uppercase font-semibold text-muted-foreground">
                          Next week:{" "}
                        </span>
                        {j.nextWeekPlan}
                      </p>
                    )}
                    {j.images && j.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {j.images.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={url}
                              alt={`Attachment ${i + 1}`}
                              className="h-16 w-16 rounded-md border object-cover hover:opacity-80"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <JournalEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        journal={editing}
        invalidateKeys={[
          ["journal", "mine"],
          ["journal", "current-week"],
          ["journal", "by-week", selectedWeekId],
          ["progress-summary"],
        ]}
      />

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this journal?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the journal for that week. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingId !== null && deleteMut.mutate(deletingId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="student-confirm-delete-journal"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
