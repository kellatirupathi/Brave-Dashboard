// BRAVE App install guide (additive, isolated).
//
// Opened in a new tab from the "BRAVE App" button and from the dashboard's
// app card. Deliberately its OWN page rather than a dialog: a student reads
// this on a desktop, then follows it on their phone, so it needs to survive
// being left open on a second screen.
//
// THE DOWNLOAD LINK IS CONFIGURED, NOT COMPILED IN. It comes from
// programme_config.braveAppDownloadUrl -- the same field the dashboard card
// reads -- so publishing a new APK is an admin action, not a release. This
// page previously hard-coded "/brave-app.apk", a path nothing ever served.
//
// TONE: the steps describe what Android actually shows, without dressing it up
// as a warning. The "unknown app" prompt appears for everything not installed
// from the Play Store; naming it calmly is what stops a student abandoning the
// install halfway.
//
// Deleting this file means removing its route in App.tsx and the button in
// components/brave-app-button.tsx.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Smartphone,
  Download,
  Share,
  Plus,
  Check,
  Info,
  Monitor,
  QrCode,
} from "lucide-react";
import { BraveLogo } from "@/components/brave-logo";
import { cn } from "@/lib/utils";

/** Object-storage paths are served through the API; anything else is a URL. */
function objectUrl(path: string): string {
  return path.startsWith("/objects/") ? `/api/storage${path}` : path;
}

type Platform = "android" | "ios" | "desktop";

type PublicAppConfig = {
  braveAppDownloadUrl: string | null;
  braveAppQrObjectPath: string | null;
};

async function getPublicAppConfig(): Promise<PublicAppConfig> {
  const response = await fetch("/api/public/app-config");
  if (!response.ok) {
    throw new Error("Failed to load BRAVE app configuration");
  }
  return response.json() as Promise<PublicAppConfig>;
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS 13+ reports itself as a Mac; the touch count is what separates them.
  if (
    /iphone|ipad|ipod/i.test(ua) ||
    (/Mac/i.test(ua) && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return "desktop";
}

/** One numbered step. */
function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold tabular-nums text-primary-foreground"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-5">{title}</p>
        {children && (
          <div className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">
            {children}
          </div>
        )}
      </div>
    </li>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 sm:p-5", className)}>
      <h2 className="text-[13px] font-bold">{title}</h2>
      {subtitle && (
        <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
      )}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** Phone illustration. Inline SVG so it follows the theme and stays sharp. */
function PhoneArt() {
  return (
    <svg
      viewBox="0 0 200 300"
      className="h-28 w-auto sm:h-32"
      role="img"
      aria-label="A phone showing the BRAVE app icon"
    >
      <rect
        x="30"
        y="10"
        width="140"
        height="280"
        rx="24"
        className="fill-card stroke-border"
        strokeWidth="3"
      />
      <rect x="82" y="20" width="36" height="6" rx="3" className="fill-border" />
      <rect
        x="42"
        y="36"
        width="116"
        height="228"
        rx="12"
        className="fill-primary"
      />
      <text
        x="100"
        y="176"
        textAnchor="middle"
        className="fill-primary-foreground"
        style={{ font: "800 92px 'Plus Jakarta Sans', system-ui, sans-serif" }}
      >
        B
      </text>
      <rect x="126" y="150" width="15" height="15" rx="2" fill="#EF9F27" />
      <rect x="82" y="272" width="36" height="4" rx="2" className="fill-border" />
    </svg>
  );
}

export default function GetApp() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const { data: config, isLoading } = useQuery({
    queryKey: ["public-app-config"],
    queryFn: getPublicAppConfig,
    staleTime: 60_000,
  });

  useEffect(() => {
    setPlatform(detectPlatform());
    document.title = "Get the BRAVE App";
  }, []);

  const downloadUrl = config?.braveAppDownloadUrl || null;
  const qrPath = config?.braveAppQrObjectPath || null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <BraveLogo className="text-lg" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Mobile app
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 pb-16 pt-6 sm:px-6 lg:pt-10">
        {/* ── Hero + download ──────────────────────────────────── */}
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
          <div className="flex flex-col items-center justify-center rounded-3xl border bg-card px-5 py-8 text-center shadow-sm sm:px-10 lg:min-h-[430px]">
            <PhoneArt />
            <h1 className="mt-4 text-xl font-extrabold tracking-tight sm:text-3xl">
              Get the BRAVE App
            </h1>
            <p className="mt-2 max-w-lg text-[13px] leading-5 text-muted-foreground sm:text-sm sm:leading-6">
              Capture leads while you are standing in the shop. Log visits,
              photograph payment proof, and keep working when the signal drops.
            </p>

            {/* iOS has no APK to offer, so it is never shown a download. */}
            {platform === "ios" ? (
              <div className="mt-5 w-full max-w-md rounded-2xl border bg-background p-4 text-left">
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  <Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />
                  On iPhone, add it from Safari
                </p>
                <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                  There is no separate download on iPhone. Follow the three steps
                  below and BRAVE appears on your home screen like any other app.
                </p>
              </div>
            ) : isLoading ? null : downloadUrl ? (
              <>
                <a
                  href={downloadUrl}
                  download
                  data-testid="button-download-apk"
                  className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-primary px-7 text-[15px] font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  <Download className="h-[18px] w-[18px]" aria-hidden="true" />
                  Download for Android
                </a>
                <p className="mt-2 text-[11.5px] text-muted-foreground">
                  Free · Android only · Installs from this page, not the Play Store
                </p>
              </>
            ) : (
              <div className="mt-5 w-full max-w-md rounded-2xl border bg-background p-4 text-left">
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  <Info className="h-4 w-4 text-primary" aria-hidden="true" />
                  The app is not published yet
                </p>
                <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                  The download will appear here as soon as it is available. The
                  dashboard works in your phone&apos;s browser in the meantime.
                </p>
              </div>
            )}
          </div>

          {platform === "desktop" && (
            <aside className="flex flex-col items-center justify-center rounded-3xl border bg-card px-6 py-8 text-center shadow-sm lg:min-h-[430px]">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <QrCode className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-bold">Install on your phone</h2>
              <p className="mt-1.5 text-[12.5px] leading-5 text-muted-foreground">
                Scan the saved QR code with your Android phone camera.
              </p>
              {isLoading ? (
                <div className="mt-6 h-56 w-56 animate-pulse rounded-2xl bg-muted" />
              ) : qrPath ? (
                <a
                  href={downloadUrl || undefined}
                  className="mt-6 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
                  aria-label="Open the BRAVE Android app download"
                >
                  <img
                    src={objectUrl(qrPath)}
                    alt="QR code linking to the BRAVE Android app"
                    className="h-56 w-56 rounded-2xl border bg-white object-contain p-2 shadow-sm"
                    data-testid="brave-app-qr"
                  />
                </a>
              ) : (
                <div className="mt-6 flex h-56 w-56 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/30 px-5">
                  <Monitor className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    The QR code will appear after an admin uploads and saves it.
                  </p>
                </div>
              )}
              {qrPath && (
                <p className="mt-4 text-xs font-medium text-muted-foreground">
                  Point your camera at the code to install
                </p>
              )}
            </aside>
          )}
        </section>

        {/* ── Supported devices ────────────────────────────────── */}
        <SectionCard
          title="Supported devices"
          subtitle="What the app runs on, and what to do if yours is not listed."
        >
          <ul className="space-y-2.5">
            {(
              [
                [
                  true,
                  "Android 8.0 or newer",
                  "Phones and tablets. This is the app you download above.",
                ],
                [
                  false,
                  "iPhone and iPad",
                  "No app to download. Add the dashboard to your home screen from Safari — steps below.",
                ],
                [
                  false,
                  "Computer",
                  "Nothing to install. Use the dashboard in your browser.",
                ],
              ] as const
            ).map(([ok, title, detail]) => (
              <li key={title} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full",
                    ok
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {ok ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : (
                    <Info className="h-3 w-3" />
                  )}
                </span>
                <span className="text-[12.5px] leading-5">
                  <span className="font-semibold">{title}</span>
                  <span className="block text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* ── Android steps ────────────────────────────────────── */}
        {platform !== "ios" && (
          <SectionCard
            title="Installing on Android"
            subtitle="About a minute, and only the first time."
          >
            <ol className="space-y-3.5">
              <Step n={1} title="Tap Download for Android">
                The file saves to your <span className="font-medium">Downloads</span>.
              </Step>
              <Step n={2} title="Open the downloaded file">
                Tap it in your notification bar, or find it in{" "}
                <span className="font-medium">Files → Downloads</span>.
              </Step>
              <Step n={3} title="Allow installing from this source">
                Android asks this the first time you install anything from
                outside the Play Store. Tap{" "}
                <span className="font-medium">Settings</span>, turn on{" "}
                <span className="font-medium">Allow from this source</span>, then
                go back.
              </Step>
              <Step n={4} title="Tap Install, then Open" />
              <Step n={5} title="Sign in with NIAT">
                The same login you use here.
              </Step>
            </ol>
          </SectionCard>
        )}

        {/* ── iPhone steps ─────────────────────────────────────── */}
        {platform !== "android" && (
          <SectionCard
            title="Installing on iPhone or iPad"
            subtitle="Added straight from Safari — nothing to download."
          >
            <ol className="space-y-3.5">
              <Step n={1} title="Open the dashboard in Safari">
                It has to be Safari. Chrome on iPhone cannot add apps to the
                home screen.
              </Step>
              <Step n={2} title="Tap the Share button">
                <span className="inline-flex items-center gap-1.5">
                  The
                  <Share className="h-3.5 w-3.5" aria-hidden="true" />
                  icon at the bottom of the screen.
                </span>
              </Step>
              <Step n={3} title="Choose Add to Home Screen">
                <span className="inline-flex items-center gap-1.5">
                  Scroll the list to find it, next to a
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  icon. Then tap <span className="font-medium">Add</span>.
                </span>
              </Step>
            </ol>
          </SectionCard>
        )}

        {/* ── What you get ─────────────────────────────────────── */}
        <SectionCard title="What the app adds">
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {[
              ["Opens like an app", "Full screen, no browser bar, stays signed in."],
              ["Camera built in", "Photograph payment proof and invoices on the spot."],
              ["Location on capture", "Stamps where you met the client."],
              ["Survives poor signal", "Keep reading your leads when the network drops."],
            ].map(([title, detail]) => (
              <li key={title} className="flex gap-2">
                <Check
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                  strokeWidth={3}
                  aria-hidden="true"
                />
                <span className="text-[12.5px] leading-5">
                  <span className="font-semibold">{title}</span>
                  <span className="block text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <p className="px-2 text-center text-[11.5px] leading-5 text-muted-foreground">
          Updates arrive on their own — you will not need to install it again.
          Stuck? Ask your campus coordinator.
        </p>
      </main>
    </div>
  );
}
