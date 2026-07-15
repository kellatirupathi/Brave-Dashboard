// Admin Config card: leaderboard display settings.
//  - Hide rank from students (they still see revenue; admins/coordinators keep
//    rank).
//  - Banner shown at the top of the leaderboard: an image URL OR a built-in
//    editable template (4 designs) with a live preview.
// Auto-loads on mount; explicit Save.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Trophy, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getLeaderboardConfig,
  saveLeaderboardConfig,
} from "@/lib/leaderboard-config-api";
import {
  BANNER_TEMPLATES,
  DEFAULT_BANNER_CONTENT,
  LeaderboardBannerTemplateView,
  type LeaderboardBannerTemplate,
  type LeaderboardBannerContent,
} from "@/components/leaderboard-banner-templates";

type Source = "image" | "template";

export function LeaderboardConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [hideRank, setHideRank] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [source, setSource] = useState<Source>("image");
  const [template, setTemplate] =
    useState<LeaderboardBannerTemplate>("broadcast");
  const [content, setContent] = useState<LeaderboardBannerContent>(
    DEFAULT_BANNER_CONTENT,
  );

  useEffect(() => {
    let cancelled = false;
    getLeaderboardConfig()
      .then((d) => {
        if (cancelled) return;
        setHideRank(d.hideRankForStudents);
        setImageUrl(d.imageUrl ?? "");
        setSource(d.bannerSource ?? "image");
        setTemplate(d.bannerTemplate ?? "broadcast");
        setContent({ ...DEFAULT_BANNER_CONTENT, ...(d.bannerContent ?? {}) });
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = (k: keyof LeaderboardBannerContent, v: string) =>
    setContent((c) => ({ ...c, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const d = await saveLeaderboardConfig({
        hideRankForStudents: hideRank,
        imageUrl: imageUrl.trim() || null,
        bannerSource: source,
        bannerTemplate: template,
        bannerContent: content,
      });
      setHideRank(d.hideRankForStudents);
      setImageUrl(d.imageUrl ?? "");
      setSource(d.bannerSource ?? "image");
      setTemplate(d.bannerTemplate ?? "broadcast");
      setContent({ ...DEFAULT_BANNER_CONTENT, ...(d.bannerContent ?? {}) });
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
        {/* Hide rank */}
        <div className="flex items-center justify-between border p-4 rounded-lg">
          <div>
            <p className="font-medium">Hide rank from students</p>
            <p className="text-sm text-muted-foreground">
              Students see only the banner below (no rankings). Turn off to show
              the normal leaderboard.
            </p>
          </div>
          <Switch
            checked={hideRank}
            onCheckedChange={setHideRank}
            disabled={!loaded || saving}
            data-testid="switch-hide-rank"
          />
        </div>

        {/* Banner source toggle */}
        <div>
          <label className="text-sm font-medium">Banner</label>
          <div className="mt-2 inline-flex rounded-md border p-1 bg-muted/40">
            <SourceTab
              active={source === "image"}
              onClick={() => setSource("image")}
              label="Image URL"
            />
            <SourceTab
              active={source === "template"}
              onClick={() => setSource("template")}
              label="Template"
            />
          </div>
        </div>

        {source === "image" ? (
          <div className="space-y-2">
            <Input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              disabled={!loaded || saving}
              placeholder="https://…/final-leaderboard.png"
              data-testid="input-leaderboard-image"
            />
            <p className="text-xs text-muted-foreground">
              Shown as a banner at the top of the leaderboard. Leave blank to
              hide it.
            </p>
            {imageUrl.trim() ? (
              <img
                src={imageUrl.trim()}
                alt="Leaderboard preview"
                className="mt-1 w-full max-h-56 rounded-md border object-contain"
              />
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {/* template picker */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BANNER_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                    template === t.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                  data-testid={`banner-template-${t.id}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* live preview */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Live preview
              </p>
              <LeaderboardBannerTemplateView
                template={template}
                content={content}
              />
            </div>

            {/* editable content */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Eyebrow">
                <Input
                  value={content.eyebrow}
                  onChange={(e) => setField("eyebrow", e.target.value)}
                  data-testid="banner-field-eyebrow"
                />
              </Field>
              <Field label="Title (use a new line for a 2-line title)">
                <Textarea
                  rows={2}
                  value={content.title}
                  onChange={(e) => setField("title", e.target.value)}
                  data-testid="banner-field-title"
                />
              </Field>
              <Field label="Subtitle">
                <Textarea
                  rows={2}
                  value={content.subtitle}
                  onChange={(e) => setField("subtitle", e.target.value)}
                  data-testid="banner-field-subtitle"
                />
              </Field>
              <Field label="Reveal time text">
                <Input
                  value={content.timeText}
                  onChange={(e) => setField("timeText", e.target.value)}
                  data-testid="banner-field-time"
                />
              </Field>
              <Field label="Chip 1">
                <Input
                  value={content.chip1}
                  onChange={(e) => setField("chip1", e.target.value)}
                  data-testid="banner-field-chip1"
                />
              </Field>
              <Field label="Chip 2">
                <Input
                  value={content.chip2}
                  onChange={(e) => setField("chip2", e.target.value)}
                  data-testid="banner-field-chip2"
                />
              </Field>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!loaded || saving}
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

function SourceTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-background shadow-sm" : "text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
