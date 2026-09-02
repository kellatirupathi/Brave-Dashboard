import { useRef, useState } from "react";
import { useGetProgrammeConfig } from "@workspace/api-client-react";
import { Smartphone } from "lucide-react";

const APP_INSTALL_PAGE_URL =
  "https://dashboard.brave.niatindia.com/get-app";

function objectUrl(path: string): string {
  return path.startsWith("/objects/") ? `/api/storage${path}` : path;
}

function deviceType(): "android" | "ios" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const agent = navigator.userAgent;
  if (/android/i.test(agent)) return "android";
  if (/iPad|iPhone|iPod/i.test(agent)) return "ios";
  return "desktop";
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#34A853" d="M3.4 2.7 14 12 3.4 21.3a2 2 0 0 1-.4-1.2V3.9c0-.5.1-.9.4-1.2Z" />
      <path fill="#4285F4" d="m14 12 3.4-3 3.8 2.1c.9.5.9 1.3 0 1.8L17.4 15 14 12Z" />
      <path fill="#FBBC04" d="M3.4 2.7 16.8 10 14 12 3.4 2.7Z" />
      <path fill="#EA4335" d="M3.4 21.3 14 12l2.8 2-13.4 7.3Z" />
    </svg>
  );
}

export function BraveAppDownloadCard() {
  const { data: config } = useGetProgrammeConfig();
  const [showScanHint, setShowScanHint] = useState(false);
  const qrRef = useRef<HTMLAnchorElement>(null);
  const kind = deviceType();
  const qrPath = config?.braveAppQrObjectPath;
  const downloadUrl = config?.braveAppDownloadUrl;

  if (!qrPath && !downloadUrl) return null;

  const handleDownload = () => {
    if (!downloadUrl) return;
    if (kind === "android") {
      window.location.assign(downloadUrl);
      return;
    }
    setShowScanHint(true);
    qrRef.current?.focus();
  };

  return (
    <section
      className="rounded-[20px] border border-[#F0E4DC] bg-white px-4 py-3 shadow-[0_2px_14px_rgba(99,11,18,0.045)]"
      data-testid="card-brave-app-download"
    >
      <div className="flex items-center gap-3">
        {qrPath && (
          <a
            ref={qrRef}
            href={APP_INSTALL_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8E0F18]"
            aria-label="Open the BRAVE app installation page"
          >
            <img
              src={objectUrl(qrPath)}
              alt="QR code for the BRAVE Android app"
              className="h-[74px] w-[74px] rounded-lg border border-[#E8D8D1] bg-white object-contain p-1"
            />
          </a>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#FDEEF0]">
              <Smartphone className="h-4 w-4 text-[#8E0F18]" />
            </span>
            <h2 className="text-[13px] font-bold text-[#2B090C]">Get the BRAVE App</h2>
          </div>
          <p className="mt-1 text-[10.5px] leading-snug text-[#8A6F66]">
            Scan the QR code or download the Android app
          </p>
          {kind === "ios" ? (
            <p className="mt-2 text-[10.5px] font-semibold text-[#8E0F18]">
              Available for Android only
            </p>
          ) : downloadUrl ? (
            <button
              type="button"
              onClick={handleDownload}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#B98A8F] bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-[#5D1118] transition-colors hover:bg-[#FFF5F5]"
              data-testid="button-download-brave-android"
            >
              <PlayIcon />
              Download Android App
            </button>
          ) : null}
        </div>
      </div>
      {showScanHint && (
        <p className="mt-2 rounded-lg bg-[#FDEEF0] px-3 py-2 text-center text-[10.5px] font-semibold text-[#8E0F18]">
          Scan QR to install on your Android phone
        </p>
      )}
    </section>
  );
}