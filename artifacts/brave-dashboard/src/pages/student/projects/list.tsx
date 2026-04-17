import { useListProjects, useCreateProject, getListProjectsQueryKey } from "@workspace/api-client-react";
import { formatINR, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Plus, Building2, Activity, Wallet, FolderOpen } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const projectSchema = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(500),
});

export default function ProjectsList() {
  const { data: projects, isLoading } = useListProjects();
  const createProject = useCreateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: { title: "", description: "" },
  });

  const onSubmit = (values: z.infer<typeof projectSchema>) => {
    createProject.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Project created successfully" });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: "Error creating project", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage your active projects and revenue</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        <Textarea placeholder="Briefly describe the project..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createProject.isPending}>
                    {createProject.isPending && <Spinner className="w-4 h-4 mr-2" />}
                    Create Project
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {!projects || projects.length === 0 ? (
        <div className="text-center py-20 bg-card border rounded-xl border-dashed">
          <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold">No projects yet</h3>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Create your first project to start tracking your order book and verified revenue.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => setIsDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Project
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project, i) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover-elevate cursor-pointer h-full flex flex-col transition-all duration-300 hover:border-primary/50 group animate-in fade-in zoom-in-95" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors">{project.title}</CardTitle>
                    <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                      {project.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-2 h-10">{project.description}</p>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Wallet className="w-3.5 h-3.5" />
                        Revenue
                      </div>
                      <div className="font-semibold text-foreground">{formatINR(project.verifiedRevenue)}</div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Activity className="w-3.5 h-3.5" />
                        Order Book
                      </div>
                      <div className="font-semibold text-foreground">{formatINR(project.verifiedOrderBook)}</div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 border-t mt-4 flex items-center justify-between text-xs text-muted-foreground py-3">
                  <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {project.clientCount} Clients</span>
                  <span>Updated {formatDate(project.updatedAt)}</span>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
