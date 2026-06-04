// Admin: New Users review queue. Lists access requests with a status filter
// (All/Pending/Approved/Rejected), free-text search, and CSV export. Clicking
// a row opens the detail page where the admin approves or rejects.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  listAdminAccessRequests,
  downloadAccessRequestsCsv,
  type AccessRequest,
  type AccessRequestStatusFilter,
} from "@/lib/access-api";
import { normalizeError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Download, Search, UserPlus } from "lucide-react";

const STATUS_TABS: { value: AccessRequestStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function StatusBadge({ status }: { status: AccessRequest["status"] }) {
  if (status === "approved")
    return (
      <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20">
        Approved
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/20">
        Rejected
      </Badge>
    );
  return (
    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
      Pending
    </Badge>
  );
}

export default function AdminNewUsersRequests() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<AccessRequestStatusFilter>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-access-requests", status, search],
    queryFn: () => listAdminAccessRequests(status, search),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadAccessRequestsCsv();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: normalizeError(err).message,
      });
    } finally {
      setExporting(false);
    }
  };

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Users</h1>
            <p className="text-sm text-muted-foreground">
              Review and approve access requests from new users.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
          className="gap-2"
        >
          {exporting ? (
            <Spinner className="w-4 h-4" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onValueChange={(v) => setStatus(v as AccessRequestStatusFilter)}
        >
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
          }}
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, NIAT ID, campus"
              className="pl-8 w-72"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="size-8" />
          </div>
        ) : isError ? (
          <div className="py-16 text-center text-destructive">
            {normalizeError(error).message}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            No access requests found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>NIAT ID</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() =>
                    setLocation(`/admin/new-users-requests/${r.id}`)
                  }
                >
                  <TableCell className="font-medium">{r.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.email}
                  </TableCell>
                  <TableCell>{r.niatId ?? "—"}</TableCell>
                  <TableCell>{r.campusName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(r.createdAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link href={`/admin/new-users-requests/${r.id}`}>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
