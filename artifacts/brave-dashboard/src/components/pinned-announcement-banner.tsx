import {
  useGetPinnedAnnouncement,
  useDismissAnnouncement,
  getGetPinnedAnnouncementQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pin, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PinnedAnnouncementBanner() {
  const { data: pinned } = useGetPinnedAnnouncement();
  const dismiss = useDismissAnnouncement();
  const queryClient = useQueryClient();

  if (!pinned) return null;

  const handleDismiss = () => {
    const id = pinned.id;
    // Optimistically clear the banner so it disappears immediately.
    queryClient.setQueryData(getGetPinnedAnnouncementQueryKey(), null);
    dismiss.mutate(
      { id },
      {
        onSettled: () =>
          queryClient.invalidateQueries({
            queryKey: getGetPinnedAnnouncementQueryKey(),
          }),
      },
    );
  };

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
      data-testid="banner-pinned-announcement"
      role="status"
    >
      <Pin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold text-sm text-foreground truncate"
          data-testid="text-pinned-title"
        >
          {pinned.title}
        </p>
        <p
          className="text-sm text-muted-foreground truncate"
          data-testid="text-pinned-body"
        >
          {pinned.body}
        </p>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 -mr-1 shrink-0"
        onClick={handleDismiss}
        disabled={dismiss.isPending}
        aria-label="Dismiss announcement"
        data-testid="button-dismiss-pinned"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
