// BRAVE App install guide (additive, isolated).
//
// Opened in a new tab from the "BRAVE App" button on the Season 2 student
// dashboard. Deliberately its OWN page rather than a dialog: a student reads
// this on the desktop, then follows it on their phone, so it needs to survive
// being left open on a second screen.
//
// TWO AUDIENCES, ONE PAGE
// - On a desktop the download is useless, so the page says so plainly and
//   offers the link to open on a phone instead.
// - On a phone it leads with the download and the steps that follow it.
//
// TONE: the instructions describe what Android actually shows, without dressing
// it up as a warning. Android's "unknown app" prompt appears for every app not
// installed from the Play Store; naming it calmly is what stops a student
// abandoning the install halfway.
//
// Deleting this file means removing its route in App.tsx and the button in
// components/brave-app-button.tsx.
import { useEffect, useState } from "react";
import {
  Smartphone,
  Download,
  Monitor,
  Share,
  Plus,
  ArrowRight,
} from "lucide-react";
import { BraveLogo } from "@/components/brave-logo";

/** Where the signed APK is published. Served as a static file. */
const APK_URL = "/brave-app.apk";

type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
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
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold tabular-nums text-primary-foreground"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="font-semibold">{title}</p>
        {children && (
          <div className="mt-1 text-sm text-muted-foreground">{children}</div>
        )}
      </div>
    </li>
  );
}

/**
 * Phone illustration. Drawn as inline SVG rather than shipped as an image so it
 * follows the theme and stays sharp at any size.
 */
function PhoneArt() {
  return (
    <svg
      viewBox="0 0 200 300"
      className="h-44 w-auto"
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
      {/* The B mark, matching the launcher icon. */}
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
      <rect
        x="82"
        y="272"
        width="36"
        height="4"
        rx="2"
        className="fill-border"
      />
    </svg>
  );
}

export default function GetApp() {
  const [platform, setPlatform] = useState<Platform>("desktop");

  useEffect(() => {
    setPlatform(detectPlatform());
    document.title = "Get the BRAVE App";
  }, []);

  const isPhone = platform === "android" || platform === "ios";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <BraveLogo className="text-xl" />
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Mobile app
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="flex flex-col items-center pt-10 text-center">
          <PhoneArt />
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Get the BRAVE App
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Capture leads while you are standing in the shop. Log visits, take
            photos of payment proof, and keep working when the signal drops.
          </p>

          {platform === "android" && (
            <a
              href={APK_URL}
              download
              data-testid="button-download-apk"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
              Download for Android
            </a>
          )}

          {platform === "ios" && (
            <div className="mt-6 w-full max-w-md rounded-lg border bg-card p-4 text-left">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />
                On iPhone, add it from Safari
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                There is no separate download on iPhone. Follow the three steps
                below and BRAVE appears on your home screen like any other app.
              </p>
            </div>
          )}

          {platform === "desktop" && (
            <div className="mt-6 w-full max-w-md rounded-lg border bg-card p-4 text-left">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Monitor className="h-4 w-4 text-primary" aria-hidden="true" />
                Open this page on your phone
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The BRAVE App runs on phones and tablets, so there is nothing to
                download on a computer. On your phone, open{" "}
                <span className="font-medium text-foreground">
                  dashboard.brave.niatindia.com/get-app
                </span>{" "}
                and the download will appear here.
              </p>
            </div>
          )}
        </section>

        {/* ── Android steps ────────────────────────────────────── */}
        {(platform === "android" || platform === "desktop") && (
          <section className="mt-12">
            <h2 className="mb-1 text-lg font-bold">On Android</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Takes about a minute.
            </p>
            <ol className="space-y-5">
              <Step n={1} title="Tap Download for Android">
                The file <span className="font-medium">brave-app.apk</span>{" "}
                saves to your Downloads.
              </Step>
              <Step n={2} title="Open the downloaded file">
                Tap it in your notification bar, or find it in{" "}
                <span className="font-medium">Files → Downloads</span>.
              </Step>
              <Step n={3} title="Allow installing from this source">
                Android asks for this the first time you install anything
                outside the Play Store. Tap{" "}
                <span className="font-medium">Settings</span>, turn on{" "}
                <span className="font-medium">Allow from this source</span>,
                then go back.
              </Step>
              <Step n={4} title="Tap Install">
                Then <span className="font-medium">Open</span> when it finishes.
              </Step>
              <Step n={5} title="Sign in with your NIAT account">
                The same login you use here. BRAVE then appears on your home
                screen.
              </Step>
            </ol>
          </section>
        )}

        {/* ── iPhone steps ─────────────────────────────────────── */}
        {(platform === "ios" || platform === "desktop") && (
          <section className="mt-12">
            <h2 className="mb-1 text-lg font-bold">On iPhone or iPad</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Add it straight from Safari — nothing to download.
            </p>
            <ol className="space-y-5">
              <Step n={1} title="Open the dashboard in Safari">
                It has to be Safari. Chrome on iPhone cannot add apps to the
                home screen.
              </Step>
              <Step n={2} title="Tap the Share button">
                <span className="inline-flex items-center gap-1.5">
                  The
                  <Share className="h-4 w-4" aria-hidden="true" />
                  icon at the bottom of the screen.
                </span>
              </Step>
              <Step n={3} title="Choose Add to Home Screen">
                <span className="inline-flex items-center gap-1.5">
                  Scroll down the list to find it, next to a
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  icon. Then tap{" "}
                  <span className="font-medium">Add</span>.
                </span>
              </Step>
            </ol>
          </section>
        )}

        {/* ── What you get ─────────────────────────────────────── */}
        <section className="mt-12 rounded-lg border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">
            What the app adds
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ["Opens like an app", "Full screen, no browser bar, stays signed in."],
              ["Camera built in", "Photograph payment proof and invoices on the spot."],
              ["Location on capture", "Stamps where you met the client."],
              ["Works with poor signal", "Keep reading your leads when the network drops."],
            ].map(([title, detail]) => (
              <li key={title} className="flex gap-2.5">
                <ArrowRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="text-sm">
                  <span className="font-medium">{title}</span>
                  <span className="block text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Updates arrive on their own — you will not need to install it again.
          {!isPhone && " Questions? Ask your campus coordinator."}
        </p>
      </main>
    </div>
  );
}
