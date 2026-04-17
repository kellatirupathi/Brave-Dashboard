import { useListRosterEntries, useAddRosterEntry, getListRosterEntriesQueryKey, useListAccessRequests, useUpdateAccessRequest, getListAccessRequestsQueryKey, useBulkImportRoster } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, Plus, Upload, CheckCircle, XCircle, Clock } from "lucide-react";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";

const CAMPUSES = [
  "AMET University",
  "Ajeenkya DY Patil University",
  "Annamacharya University",
  "Aurora Deemed University",
  "Chaitanya – Deemed to be University",
  "Chalapathi Institute of Engineering and Technology",
  "Chalapathi Institute of Technology, Autonomous",
  "Crescent University",
  "Malla Reddy Vishwavidyapeeth",
  "NIAT - Chevella",
  "NIAT - KKH",
  "NRI Institute of Technology",
  "NSRIT - Nadimpalli Satyanarayana Raju Institute of Technology",
  "Noida International University",
  "S-VYASA University",
  "Sanjay Ghodawat University",
  "Takshashila University",
  "Vivekananda Global University",
  "Yenepoya University",
];

export default function AdminRoster() {
  const { data: roster, isLoading } = useListRosterEntries({});
  const { data: accessRequests, isLoading: requestsLoading } = useListAccessRequests({});
  const addEntry = useAddRosterEntry();
  const bulkImport = useBulkImportRoster();
  const updateRequest = useUpdateAccessRequest();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Add single student form
  const [studentId, setStudentId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [campusName, setCampusName] = useState("");
  const [niatId, setNiatId] = useState("");
  const [batchSectionName, setBatchSectionName] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addEntry.mutate(
      { data: { studentId, fullName, email: email || undefined as unknown as string, campusName, niatId: niatId || null, batchSectionName: batchSectionName || null } },
      {
        onSuccess: () => {
          toast({ title: "Student added to roster" });
          queryClient.invalidateQueries({ queryKey: getListRosterEntriesQueryKey() });
          setIsAddOpen(false);
          setStudentId(""); setFullName(""); setEmail(""); setCampusName(""); setNiatId(""); setBatchSectionName("");
        },
        onError: () => toast({ title: "Failed to add student", variant: "destructive" }),
      }
    );
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const students = rows
          .filter(row => row["Student Name"] || row["studentName"])
          .map(row => ({
            studentUserId: String(row["Student User ID"] || row["studentUserId"] || ""),
            studentName: String(row["Student Name"] || row["studentName"] || ""),
            niatId: String(row["NIAT ID"] || row["niatId"] || ""),
            instituteName: String(row["Institute Name"] || row["instituteName"] || ""),
            batchSectionName: String(row["Batch Section Name"] || row["batchSectionName"] || ""),
          }))
          .filter(s => s.studentName && s.instituteName);

        if (students.length === 0) {
          toast({ title: "No valid rows found in the file", description: "Expected columns: Student User ID, Student Name, NIAT ID, Institute Name, Batch Section Name", variant: "destructive" });
          setIsImporting(false);
          return;
        }

        bulkImport.mutate(
          { data: { students } },
          {
            onSuccess: (result) => {
              toast({
                title: `Import complete`,
                description: `${result.inserted} students added, ${result.skipped} skipped (duplicates).`,
              });
              queryClient.invalidateQueries({ queryKey: getListRosterEntriesQueryKey() });
              setIsImporting(false);
            },
            onError: () => {
              toast({ title: "Import failed", variant: "destructive" });
              setIsImporting(false);
            },
          }
        );
      } catch {
        toast({ title: "Failed to read file", description: "Make sure it is a valid .xlsx or .csv file", variant: "destructive" });
        setIsImporting(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleApproveReject = (id: number, status: "approved" | "rejected") => {
    updateRequest.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: status === "approved" ? "Request approved" : "Request rejected" });
          queryClient.invalidateQueries({ queryKey: getListAccessRequestsQueryKey() });
        },
        onError: () => toast({ title: "Failed to update request", variant: "destructive" }),
      }
    );
  };

  const pendingCount = accessRequests?.filter(r => r.status === "pending").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student Roster</h1>
          <p className="text-muted-foreground">Manage the master list of enrolled students</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileImport}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || bulkImport.isPending}
          >
            {isImporting || bulkImport.isPending
              ? <Spinner className="w-4 h-4 mr-2" />
              : <Upload className="w-4 h-4 mr-2" />}
            Import Excel
          </Button>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Add Student</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add to Roster</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Student User ID</label>
                    <Input value={studentId} onChange={e => setStudentId(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">NIAT ID</label>
                    <Input value={niatId} onChange={e => setNiatId(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input value={fullName} onChange={e => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email (optional)</label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Campus</label>
                  <Select value={campusName} onValueChange={setCampusName} required>
                    <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                    <SelectContent>
                      {CAMPUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Batch / Section</label>
                  <Input value={batchSectionName} onChange={e => setBatchSectionName(e.target.value)} />
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={addEntry.isPending}>
                    {addEntry.isPending && <Spinner className="w-4 h-4 mr-2" />} Save
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">
            Enrolled Students {roster ? `(${roster.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="requests">
            Access Requests
            {pendingCount > 0 && (
              <Badge className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0">{pendingCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-4">
          <Card>
            {isLoading ? (
              <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student User ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>NIAT ID</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead>Batch / Section</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster?.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{entry.studentId || "—"}</TableCell>
                      <TableCell className="font-medium">{entry.fullName}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.niatId || "—"}</TableCell>
                      <TableCell className="text-sm">{entry.campusName}</TableCell>
                      <TableCell className="text-sm">{entry.batchSectionName || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.email || "—"}</TableCell>
                      <TableCell>
                        {entry.isWhitelisted
                          ? <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
                          : <Badge variant="secondary">Inactive</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {roster?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No students on roster. Use "Import Excel" to bulk-add students.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <Card>
            {requestsLoading ? (
              <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>NIAT ID</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessRequests?.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.fullName}</TableCell>
                      <TableCell className="text-sm">{req.email}</TableCell>
                      <TableCell className="font-mono text-xs">{req.niatId || "—"}</TableCell>
                      <TableCell className="text-sm">{req.campusName}</TableCell>
                      <TableCell className="text-sm">{req.batch || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(req.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </TableCell>
                      <TableCell>
                        {req.status === "pending" && (
                          <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1">
                            <Clock className="w-3 h-3" /> Pending
                          </Badge>
                        )}
                        {req.status === "approved" && (
                          <Badge className="bg-green-500 hover:bg-green-600 gap-1">
                            <CheckCircle className="w-3 h-3" /> Approved
                          </Badge>
                        )}
                        {req.status === "rejected" && (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="w-3 h-3" /> Rejected
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {req.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                              onClick={() => handleApproveReject(req.id, "approved")}
                              disabled={updateRequest.isPending}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10"
                              onClick={() => handleApproveReject(req.id, "rejected")}
                              disabled={updateRequest.isPending}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {accessRequests?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        No access requests yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
