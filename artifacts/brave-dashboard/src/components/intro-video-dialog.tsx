import { X } from "lucide-react";
import { useEffect, useState } from "react";

export const INTRO_VIDEO_DRIVE_FILE_ID = "1BFDX3obdB-b2Jt2Wcaq3egOozANr6s8B";
export const INTRO_VIDEO_DISMISSED_KEY = "brave_intro_video_dismissed";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function IntroVideoDialog({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-video-title"
      data-testid="dialog-intro-video"
    >
      <div className="relative w-full max-w-[720px] rounded-lg bg-background shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close intro video"
          data-testid="button-close-intro-video"
          className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background text-foreground shadow-md border border-border hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pt-6 pb-3">
          <h2
            id="intro-video-title"
            className="text-xl font-bold"
          >
            Welcome to BRAVE Dashboard
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Watch this quick intro to get started
          </p>
        </div>

        <div className="px-6 pb-6">
          <div className="relative w-full overflow-hidden rounded-md bg-black" style={{ paddingTop: "56.25%" }}>
            <iframe
              src={`https://drive.google.com/file/d/${INTRO_VIDEO_DRIVE_FILE_ID}/preview`}
              className="absolute inset-0 h-full w-full"
              allow="autoplay"
              allowFullScreen
              title="BRAVE intro video"
              data-testid="iframe-intro-video"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mounts the intro video on the student dashboard. Auto-opens the first time
 * a given browser sees the dashboard; once the student closes it, the choice
 * is persisted in localStorage and the auto-popup never appears again.
 *
 * The "Watch intro video" link in the sidebar uses the same dialog component
 * directly (controlled there) so students can rewatch any time without
 * clearing the localStorage flag.
 */
export function AutoIntroVideo() {
  const [open, setOpen] = useStateOpenOnFirstVisit();
  return (
    <IntroVideoDialog
      open={open}
      onClose={() => {
        try {
          localStorage.setItem(INTRO_VIDEO_DISMISSED_KEY, "true");
        } catch {
          // localStorage may be unavailable (private mode, etc.) — that's fine,
          // it just means the popup will show again next visit.
        }
        setOpen(false);
      }}
    />
  );
}

function useStateOpenOnFirstVisit(): [boolean, (v: boolean) => void] {
  // Default closed; flip open on mount only if not already dismissed. This
  // avoids a flash of the modal during initial render.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(INTRO_VIDEO_DISMISSED_KEY) !== "true") {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);
  return [open, setOpen];
}
