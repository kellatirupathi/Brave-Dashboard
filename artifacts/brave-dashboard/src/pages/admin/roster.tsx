import { useListRosterEntries, useAddRosterEntry, getListRosterEntriesQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function AdminRoster() {
  const { data: roster, isLoading } = useListRosterEntries({});
  const addEntry = useAddRosterEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [campusName, setCampusName] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addEntry.mutate({ data: { studentId, fullName, email, campusName } }, {
      onSuccess: () => {
        toast({ title: "Student added to roster" });
        queryClient.invalidateQueries({ queryKey: getListRosterEntriesQueryKey() });
        setIsOpen(false);
        setStudentId("");
        setFullName("");
        setEmail("");
        setCampusName("");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student Roster</h1>
          <p className="text-muted-foreground">Manage the master list of enrolled students</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Student</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Roster</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Student ID</label>
                <Input value={studentId} onChange={e => setStudentId(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Full Name</label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Campus Name</label>
                <Input value={campusName} onChange={e => setCampusName(e.target.value)} required />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={addEntry.isPending}>
                  {addEntry.isPending && <Spinner className="w-4 h-4 mr-2" />} Save
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
                <TableHead>Student ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster?.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">{entry.studentId}</TableCell>
                  <TableCell className="font-medium">{entry.fullName}</TableCell>
                  <TableCell>{entry.email}</TableCell>
                  <TableCell>{entry.campusName}</TableCell>
                  <TableCell>
                    {entry.isWhitelisted ? <Badge className="bg-green-500 hover:bg-green-600">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {roster?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No students on roster
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
