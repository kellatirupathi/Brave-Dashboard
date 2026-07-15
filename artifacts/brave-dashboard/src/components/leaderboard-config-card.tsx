// Admin Config card: leaderboard display settings.
//  - Hide rank from students (they still see revenue; admins/coordinators keep
//    rank).
//  - Banner image URL shown at the top of the leaderboard page.
// Auto-loads on mount; explicit Save.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Trophy, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getLeaderboardConfig,
  saveLeaderboardConfig,
} from "@/lib/leaderboard-config-api";

export function LeaderboardConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [hideRank, setHideRank] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [initial, setInitial] = useState<{
    hideRank: boolean;
    imageUrl: string;
  }>({ hideRank: false, imageUrl: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLeaderboardConfig()
      .then((data) => {
        if (cancelled) return;
        setHideRank(data.hideRankForStudents);
        setImageUrl(data.imageUrl ?? "");
        setInitial({
          hideRank: data.hideRankForStudents,
          imageUrl: data.imageUrl ?? "",
        });
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    hideRank !== initial.hideRank ||
    imageUrl.trim() !== initial.imageUrl.trim();

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await saveLeaderboardConfig({
        hideRankForStudents: hideRank,
        imageUrl: imageUrl.trim() || null,
      });
      setHideRank(data.hideRankForStudents);
      setImageUrl(data.imageUrl ?? "");
      setInitial({
        hideRank: data.hideRankForStudents,
        imageUrl: data.imageUrl ?? "",
      });
      queryClient.invalidateQueries({ queryKey: ["leaderboard-config"] });
      toast({ title: "Leaderboard settings saved" });
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="card-leaderboard-config">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Leaderboard
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Control what students see on the leaderboard. Admins and coordinators
          always see full ranks.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between border p-4 rounded-lg">
          <div>
            <p className="font-medium">Hide rank from students</p>
            <p className="text-sm text-muted-foreground">
              Students see their revenue but not their rank (no 1/2/3 medals or
              rank numbers).
            </p>
          </div>
          <Switch
            checked={hideRank}
            onCheckedChange={setHideRank}
            disabled={!loaded || saving}
            data-testid="switch-hide-rank"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Leaderboard image URL (optional)
          </label>
          <Input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            disabled={!loaded || saving}
            placeholder="https://…/final-leaderboard.png"
            data-testid="input-leaderboard-image"
          />
          <p className="text-xs text-muted-foreground">
            Shown as a banner at the top of the leaderboard page. Leave blank to
            hide it.
          </p>
          {imageUrl.trim() ? (
            <img
              src={imageUrl.trim()}
              alt="Leaderboard preview"
              className="mt-2 w-full max-h-56 rounded-md border object-contain"
            />
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!loaded || saving || !dirty}
            data-testid="button-save-leaderboard-config"
          >
            {saving ? (
              <Spinner className="w-4 h-4 mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
