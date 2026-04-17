import { useListCampuses, useCreateCampus, getListCampusesQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, Plus } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";

export default function AdminCampuses() {
  const { data: campuses, isLoading } = useListCampuses();
  const createCampus = useCreateCampus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createCampus.mutate({ data: { name, city, state } }, {
      onSuccess: () => {
        toast({ title: "Campus created" });
        queryClient.invalidateQueries({ queryKey: getListCampusesQueryKey() });
        setIsOpen(false);
        setName("");
        setCity("");
        setState("");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campuses</h1>
          <p className="text-muted-foreground">Manage participating campuses</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Campus</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Campus</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Campus Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">City</label>
                  <Input value={city} onChange={e => setCity(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">State</label>
                  <Input value={state} onChange={e => setState(e.target.value)} required />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createCampus.isPending}>
                  {createCampus.isPending && <Spinner className="w-4 h-4 mr-2" />} Create
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campus Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Teams (Active)</TableHead>
                <TableHead className="text-right">Total Revenue</TableHead>
                <TableHead className="text-right">Coordinator</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campuses?.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.city}, {c.state}</TableCell>
                  <TableCell className="text-right">{c.activeTeams} / {c.totalTeams}</TableCell>
                  <TableCell className="text-right font-medium text-primary">{formatINR(c.totalRevenue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{c.coordinatorName || "Unassigned"}</TableCell>
                </TableRow>
              ))}
              {campuses?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No campuses found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
