import { useGetProgrammeConfig, useUpdateProgrammeConfig, getGetProgrammeConfigQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Settings, Calendar, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AdminConfig() {
  const { data: config, isLoading } = useGetProgrammeConfig();
  const updateConfig = useUpdateProgrammeConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (config) setFormData(config);
  }, [config]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    updateConfig.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "Configuration saved" });
        queryClient.invalidateQueries({ queryKey: getGetProgrammeConfigQueryKey() });
      }
    });
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Programme Configuration</h1>
        <p className="text-muted-foreground">Manage global settings for the BRAVE programme</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /> Key Dates & Deadlines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Input type="date" value={formData.startDate?.split('T')[0] || ''} onChange={e => handleChange('startDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Input type="date" value={formData.endDate?.split('T')[0] || ''} onChange={e => handleChange('endDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Demo Day Date</label>
              <Input type="date" value={formData.demoDayDate?.split('T')[0] || ''} onChange={e => handleChange('demoDayDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Application Deadline</label>
              <Input type="date" value={formData.demoDayApplicationDeadline?.split('T')[0] || ''} onChange={e => handleChange('demoDayApplicationDeadline', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5 text-primary" /> Thresholds & Toggles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Demo Eligibility Threshold (₹)</label>
            <Input type="number" value={formData.demoEligibilityThreshold || ''} onChange={e => handleChange('demoEligibilityThreshold', Number(e.target.value))} />
          </div>
          
          <div className="flex items-center justify-between border p-4 rounded-lg">
            <div>
              <p className="font-medium">Leaderboard Frozen</p>
              <p className="text-sm text-muted-foreground">Hide the leaderboard from students to build suspense.</p>
            </div>
            <Switch checked={formData.leaderboardFrozen || false} onCheckedChange={c => handleChange('leaderboardFrozen', c)} />
          </div>

          <div className="flex items-center justify-between border p-4 rounded-lg">
            <div>
              <p className="font-medium">Demo Day Applications Open</p>
              <p className="text-sm text-muted-foreground">Allow eligible teams to submit their pitches.</p>
            </div>
            <Switch checked={formData.demoDayApplicationsOpen || false} onCheckedChange={c => handleChange('demoDayApplicationsOpen', c)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateConfig.isPending}>
          {updateConfig.isPending ? <Spinner className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
