// New Demo Day page (student): "Add your best project for Demo Day". Replaces
// the old 3-level eligibility page. Open to EVERY team — submitting does not
// guarantee a presentation slot; admins shortlist. Uses the hand-written
// demoday-submissions API + the existing presigned-upload flow (reused from the
// projects page). Fully additive: the legacy Demo Day application flow is
// untouched.
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Rocket,
  Upload,
  CheckCircle2,
  Users,
  Building2,
  Info,
  Link as LinkIcon,
  FileText,
} from "lucide-react";
import {
  getMyDemoDaySubmission,
  saveDemoDaySubmission,
  type DemoDaySubmission,
} from "@/lib/demoday-submissions-api";

const NONE_PROJECT = "__none__";

export default function DemoDayUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const requestUpload = useRequestUploadUrl();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["my-demo-day-submission"],
    queryFn: getMyDemoDaySubmission,
  });
  const { data: projects } = useListProjects();

  const [projectId, setProjectId] = useState<string>(NONE_PROJECT);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Hydrate the form once the existing submission loads.
  useEffect(() => {
    if (existing) {
      setProjectId(
        existing.projectId ? String(existing.projectId) : NONE_PROJECT,
      );
      setTitle(existing.title);
      setDescription(existing.description);
      setLink(existing.link ?? "");
      setFileUrl(existing.fileUrl ?? null);
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: saveDemoDaySubmission,
    onSuccess: (saved: DemoDaySubmission) => {
      queryClient.setQueryData(["my-demo-day-submission"], saved);
      toast({
        title: existing ? "Submission updated" : "Project submitted",
        description:
          "Your best project has been submitted for Demo Day consideration.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Couldn't save your submission",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
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
      setFileUrl(presigned.objectPath);
      toast({ title: "File uploaded" });
    } catch {
      toast({
        title: "Upload failed",
        description: "Could not upload the file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast({
        title: "Missing details",
        description: "Please add a project title and a short description.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({
      projectId: projectId === NONE_PROJECT ? null : Number(projectId),
      title: title.trim(),
      description: description.trim(),
      link: link.trim() || null,
      fileUrl,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const statusBadge =
    existing?.status === "shortlisted" ? (
      <Badge className="bg-green-500 hover:bg-green-600">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Shortlisted
      </Badge>
    ) : existing?.status === "rejected" ? (
      <Badge variant="secondary">Not shortlisted</Badge>
    ) : existing ? (
      <Badge variant="secondary">Submitted</Badge>
    ) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="mobile-page-heading">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Rocket className="h-7 w-7 text-primary" /> Demo Day
        </h1>
        <p className="mt-1 text-muted-foreground">
          Add your best project to be considered for a Demo Day presentation.
        </p>
      </div>

      {/* What Demo Day is — required informational copy. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-primary" /> About Demo Day
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Selected teams will present their work in front of{" "}
            <span className="font-medium text-foreground">
              investors, angel investors, and founders of NxtWave
            </span>
            .
          </p>
          <p>
            <span className="font-medium text-foreground">
              You don&apos;t need to be in the top 3 to apply.
            </span>{" "}
            Even if your team has earned a smaller amount, a strong project can
            be considered.
          </p>
          <p>
            Submitting a project{" "}
            <span className="font-medium text-foreground">
              does not guarantee a presentation slot
            </span>{" "}
            — our team will shortlist which projects move forward.
          </p>
          <p>
            This is an opportunity to{" "}
            <span className="font-medium text-foreground">
              present your work
            </span>
            . There is{" "}
            <span className="font-medium text-foreground">
              no guarantee of any funding
            </span>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Your best project</span>
            {statusBadge}
          </CardTitle>
          {existing?.reviewNote && (
            <p className="text-sm text-muted-foreground">
              Note from the team: {existing.reviewNote}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Pick an existing project (optional) */}
            <div className="space-y-2">
              <Label>Link an existing project (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger data-testid="select-demo-project">
                  <SelectValue placeholder="Choose one of your projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_PROJECT}>
                    No specific project
                  </SelectItem>
                  {(projects?.items ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="demo-title">Project title</Label>
              <Input
                id="demo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AI billing assistant for local pharmacies"
                maxLength={200}
                data-testid="input-demo-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="demo-description">
                Why is this your best work?
              </Label>
              <Textarea
                id="demo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the project, the problem it solves, and the impact / results so far."
                rows={5}
                maxLength={4000}
                data-testid="input-demo-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="demo-link" className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" /> Link (deck / demo / video)
                — optional
              </Label>
              <Input
                id="demo-link"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://…"
                data-testid="input-demo-link"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Upload a file (deck /
                one-pager PDF) — optional
              </Label>
              <div className="flex items-center gap-3">
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent ${
                    uploading ? "pointer-events-none opacity-60" : ""
                  }`}
                  data-testid="label-demo-file"
                >
                  {uploading ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {fileUrl ? "Replace file" : "Choose file"}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </label>
                {fileUrl && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> File attached
                  </span>
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={saveMutation.isPending || uploading}
              data-testid="button-submit-demo-day"
            >
              {saveMutation.isPending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Saving…
                </>
              ) : existing ? (
                "Update submission"
              ) : (
                "Submit for Demo Day"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tiny footer reminder mirroring the legacy page's team affordance. */}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> One submission per team —{" "}
        <Building2 className="h-3.5 w-3.5" /> editable any time before
        shortlisting.
      </p>
    </div>
  );
}
