import { useGetDemoDayApplication, useSubmitDemoDayApplication, useUpdateDemoDayApplication, useGetTeamDashboardSummary, getGetDemoDayApplicationQueryKey } from "@workspace/api-client-react";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { FileText, Link as LinkIcon, UploadCloud, CheckCircle, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

export default function DemoDay() {
  const { data: summary, isLoading: summaryLoading } = useGetTeamDashboardSummary();
  const { data: application, isLoading: appLoading } = useGetDemoDayApplication();
  
  const submitApp = useSubmitDemoDayApplication();
  const updateApp = useUpdateDemoDayApplication();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [demoUrl, setDemoUrl] = useState("");
  const [pitchDeckUrl, setPitchDeckUrl] = useState("");
  const [growthPlan, setGrowthPlan] = useState("");

  useEffect(() => {
    if (application) {
      setDemoUrl(application.demoUrl || "");
      setPitchDeckUrl(application.pitchDeckUrl || "");
      setGrowthPlan(application.growthPlan || "");
    }
  }, [application]);

  if (summaryLoading || appLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (!summary) return <div>Failed to load data</div>;

  const isEligible = summary.demoEligible;
  const demoDayThreshold = 200000;
  const progressPercent = Math.min((summary.totalRevenue / demoDayThreshold) * 100, 100);

  const handleSave = () => {
    const action = application ? "updated" : "submitted";
    
    submitApp.mutate({ data: { demoUrl, pitchDeckUrl, growthPlan } }, {
      onSuccess: () => {
        toast({ title: `Application ${action}` });
        queryClient.invalidateQueries({ queryKey: getGetDemoDayApplicationQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Failed to save application", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Demo Day</h1>
        <p className="text-muted-foreground mt-1">Qualify and apply for the national showcase</p>
      </div>

      <Card className={isEligible ? "border-green-500/50 bg-green-500/5" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Eligibility Status
            {isEligible ? <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Qualified</Badge> : <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" /> Locked</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between text-sm mb-2 font-medium">
            <span>Verified Revenue: {formatINR(summary.totalRevenue)}</span>
            <span>Target: {formatINR(demoDayThreshold)}</span>
          </div>
          <Progress value={progressPercent} className="h-3" />
          {!isEligible && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              You need {formatINR(demoDayThreshold - summary.totalRevenue)} more verified revenue to unlock the application.
            </p>
          )}
        </CardContent>
      </Card>

      {isEligible && (
        <Card>
          <CardHeader>
            <CardTitle>Application Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Demo Video URL</label>
              <Input placeholder="https://youtube.com/..." value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><UploadCloud className="w-4 h-4" /> Pitch Deck URL</label>
              <Input placeholder="Link to slides..." value={pitchDeckUrl} onChange={(e) => setPitchDeckUrl(e.target.value)} />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><FileText className="w-4 h-4" /> Growth Plan</label>
              <Textarea 
                placeholder="How will you scale after Demo Day?" 
                rows={6}
                value={growthPlan} 
                onChange={(e) => setGrowthPlan(e.target.value)} 
              />
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={handleSave} disabled={submitApp.isPending || updateApp.isPending}>
                {(submitApp.isPending || updateApp.isPending) && <Spinner className="w-4 h-4 mr-2" />}
                {application ? "Update Application" : "Submit Application"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
