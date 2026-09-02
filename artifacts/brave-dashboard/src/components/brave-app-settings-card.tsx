import { useEffect, useRef, useState } from "react";
import {
  getGetProgrammeConfigQueryKey,
  useGetProgrammeConfig,
  useRequestUploadUrl,
  useUpdateProgrammeConfig,
} from "@workspace/api-client-react";
import { ImageUp, Save, Smartphone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";

function objectUrl(path: string): string {
  return path.startsWith("/objects/") ? `/api/storage${path}` : path;
}

export function BraveAppSettingsCard() {
  const { data: config } = useGetProgrammeConfig();
  const updateConfig = useUpdateProgrammeConfig();
  const requestUpload = useRequestUploadUrl();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [qrPath, setQrPath] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!config) return;
    setQrPath(config.braveAppQrObjectPath ?? "");
    setDownloadUrl(config.braveAppDownloadUrl ?? "");
  }, [config]);

  const uploadQr = async (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast({
        title: "Unsupported QR image",
        description: "Upload a PNG, JPG, or WEBP image.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const presigned = await requestUpload.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      const response = await fetch(presigned.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed");
      await updateConfig.mutateAsync({
        data: { braveAppQrObjectPath: presigned.objectPath },
      });
      setQrPath(presigned.objectPath);
      await queryClient.invalidateQueries({
        queryKey: getGetProgrammeConfigQueryKey(),
      });
      toast({
        title: "QR code uploaded and saved",
        description: "Students will now see this QR code.",
      });
    } catch {
      toast({
        title: "QR upload failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const save = () => {
    const trimmedUrl = downloadUrl.trim();
    if (trimmedUrl) {
      try {
        const url = new URL(trimmedUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        toast({
          title: "Invalid Android link",
          description: "Enter a complete https:// link.",
          variant: "destructive",
        });
        return;
      }
    }
    updateConfig.mutate(
      {
        data: {
          braveAppQrObjectPath: qrPath || null,
          braveAppDownloadUrl: trimmedUrl || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetProgrammeConfigQueryKey(),
          });
          toast({ title: "BRAVE App settings saved" });
        },
        onError: () =>
          toast({
            title: "Could not save BRAVE App settings",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Card data-testid="card-brave-app-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          BRAVE Android App
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Control the QR code and Android download destination shown at the
          bottom of the student desktop dashboard.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-2">
            <Label>QR code</Label>
            <p className="text-xs text-muted-foreground">
              Upload a QR image that points to the same latest APK link.
            </p>
          </div>
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => uploadQr(event.target.files?.[0])}
              data-testid="input-brave-app-qr"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Spinner className="h-4 w-4" /> : <ImageUp className="h-4 w-4" />}
              {uploading ? "Uploading & saving…" : "Upload QR image"}
            </Button>
            {qrPath && (
              <img
                src={objectUrl(qrPath)}
                alt="Current BRAVE App QR code"
                className="mx-auto h-28 w-28 rounded-lg border bg-white object-contain p-1"
              />
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr] sm:items-center">
          <Label htmlFor="brave-app-download-url">Google Play / APK link</Label>
          <Input
            id="brave-app-download-url"
            type="url"
            placeholder="https://…"
            value={downloadUrl}
            onChange={(event) => setDownloadUrl(event.target.value)}
            data-testid="input-brave-app-download-url"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            className="gap-2"
            onClick={save}
            disabled={uploading || updateConfig.isPending}
            data-testid="button-save-brave-app-settings"
          >
            {updateConfig.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save App Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}