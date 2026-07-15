import {
  useListProjects,
  useCreateProject,
  getListProjectsQueryKey,
  useGetMyTeam,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { formatINR, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Plus,
  Building2,
  Activity,
  Wallet,
  FolderOpen,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import { VerificationTimelineNote } from "@/components/verification-timeline-note";
import { InternationalClientsNote } from "@/components/international-clients-note";
import { ProjectsLockBanner } from "@/components/projects-lock-banner";

const projectSchema = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(500),
});

export default function ProjectsList() {
  const { data: projectsResponse, isLoading } = useListProjects();
  const projects = projectsResponse?.items ?? [];
  const {
    data: myTeam,
    isLoading: teamLoading,
    isError: teamIsError,
    error: teamError,
  } = useGetMyTeam({
    query: { queryKey: getGetMyTeamQueryKey(), retry: false },
  });
  const createProject = useCreateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // The /teams/my endpoint returns 404 for a genuine "no team". Any other
  // error (network blip, 5xx) is transient — don't demote a real leader to
  // read-only on a transient failure; show an error affordance instead.
  const teamLoadFailed =
    teamIsError && normalizeError(teamError).status !== 404;
  const hasTeam = !!myTeam;
  const isLeader =
    !!myTeam && !!user && String(myTeam.leaderId) === String(user.id);

  const form = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: { title: "", description: "" },
  });

  const onSubmit = (values: z.infer<typeof projectSchema>) => {
    createProject.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Project created successfully" });
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryKey(),
          });
          setIsDialogOpen(false);
          form.reset();
        },
        onError: (err: unknown) => {
          toast({
            title: "Couldn't create project",
            description: normalizeError(err, "Something went wrong.").message,
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isLoading || teamLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin "projects submissions lock" notice — shown while locked. */}
      <ProjectsLockBanner canRequest={isLeader} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage your active projects and revenue
          </p>
        </div>

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            if (!open || (hasTeam && isLeader)) setIsDialogOpen(open);
          }}
        >
          {hasTeam && isLeader ? (
            <DialogTrigger asChild>
              <Button data-testid="button-new-project">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
          ) : teamLoadFailed ? null : !hasTeam ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button disabled data-testid="button-new-project-disabled">
                      <Plus className="w-4 h-4 mr-2" />
                      New Project
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Join or create a team first to add projects.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Acme Corp CRM" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Briefly describe the project..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createProject.isPending}>
                    {createProject.isPending && (
                      <Spinner className="w-4 h-4 mr-2" />
                    )}
                    Create Project
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {teamLoadFailed && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="banner-team-load-failed"
        >
          We couldn't load your team right now, so project actions are
          temporarily unavailable. Please refresh the page to try again.
        </div>
      )}

      {hasTeam && !isLeader && (
        <div
          className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
          data-testid="banner-projects-readonly"
        >
          You are a team member. Only the team leader can create, edit, or
          delete projects — ask your leader to make changes.
        </div>
      )}

      <InternationalClientsNote />
      <VerificationTimelineNote />

      {!projects || projects.length === 0 ? (
        <div className="text-center py-20 bg-card border rounded-xl border-dashed">
          {hasTeam ? (
            <>
              <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold">No projects yet</h3>
              {isLeader ? (
                <>
                  <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                    Create your first project to start tracking your order book
                    and verified revenue.
                  </p>
                  <Button
                    className="mt-6"
                    variant="outline"
                    onClick={() => setIsDialogOpen(true)}
                    data-testid="button-add-project"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Project
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  Your team leader hasn't added any projects yet.
                </p>
              )}
            </>
          ) : teamLoadFailed ? (
            <>
              <Users className="w-12 h-12 text-destructive mx-auto mb-4 opacity-60" />
              <h3 className="text-lg font-semibold">Couldn't load your team</h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                We couldn't check your team membership just now. Please refresh
                the page to try again.
              </p>
            </>
          ) : (
            <>
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold">
                Join a team to add projects
              </h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                Projects belong to a team. Join an existing team or create your
                own to start tracking revenue.
              </p>
              <Link href="/get-started">
                <Button
                  className="mt-6"
                  variant="outline"
                  data-testid="button-join-team"
                >
                  <Users className="w-4 h-4 mr-2" /> Join or create a team
                </Button>
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {projects.map((project, i) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card
                className="hover-elevate cursor-pointer transition-all duration-300 hover:border-primary/50 group animate-in fade-in slide-in-from-bottom-2"
                style={{
                  animationDelay: `${i * 50}ms`,
                  animationFillMode: "both",
                }}
              >
                <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:gap-8">
                  {/* Left — title, description, meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                        {project.title}
                      </h3>
                      <Badge
                        variant={
                          project.status === "active" ? "default" : "secondary"
                        }
                        className="capitalize shrink-0"
                      >
                        {project.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1 mt-1.5">
                      {project.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />{" "}
                        {project.clientCount} Clients
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FolderOpen className="w-3.5 h-3.5" /> Updated{" "}
                        {formatDate(project.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Right — revenue & order book */}
                  <div className="grid grid-cols-2 gap-3 md:w-[340px] md:shrink-0">
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Wallet className="w-3.5 h-3.5" />
                        Revenue
                      </div>
                      <div className="font-semibold text-foreground">
                        {formatINR(project.verifiedRevenue)}
                      </div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Activity className="w-3.5 h-3.5" />
                        Order Book
                      </div>
                      <div className="font-semibold text-foreground">
                        {formatINR(project.verifiedOrderBook)}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
