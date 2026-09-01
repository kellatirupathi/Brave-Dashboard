import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useSeason } from "@/lib/season-context";
import { isNativeApp } from "@/lib/native-auth";
import {
  getProductTourProgress,
  saveProductTourProgress,
  type ProductTourPlatform,
} from "@/lib/product-tour-api";

type TourStep = {
  route: string;
  selector?: string;
  title: string;
  body: string;
};

function platformForViewport(): ProductTourPlatform {
  return isNativeApp() ||
    window.matchMedia("(max-width: 1023px)").matches
    ? "mobile"
    : "desktop";
}

export function ProductTour() {
  const { user } = useAuth();
  const { viewing } = useSeason();
  const [location, setLocation] = useLocation();
  const [platform] = useState<ProductTourPlatform>(platformForViewport);
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const sessionKey = `brave-product-tour-${user?.id ?? "anonymous"}-${platform}`;
  const pipelineRoute = viewing?.slug === "1.0" ? "/projects" : "/leads";
  const pipelineName = viewing?.slug === "1.0" ? "Projects" : "Leads";

  const steps = useMemo<TourStep[]>(() => {
    if (platform === "mobile") {
      return [
        {
          route: "/",
          title: "Welcome to BRAVE",
          body: "Here is a quick tour of the main places you will use in the mobile app.",
        },
        {
          route: "/",
          selector: '[data-testid="mobile-performance-arc"]',
          title: "Track your performance",
          body: "Your dashboard keeps revenue, progress, journals, and programme milestones together.",
        },
        {
          route: pipelineRoute,
          selector: "main",
          title: pipelineName,
          body:
            pipelineName === "Leads"
              ? "Capture real client conversations here, then move qualified work into delivery and payment."
              : "Create projects and keep revenue evidence organised here.",
        },
        {
          route: "/journal",
          selector: '[data-testid="journal-week-picker"]',
          title: "Weekly Journal",
          body: "Choose the week, record what your team achieved, and submit before the deadline.",
        },
        {
          route: "/",
          selector: '[data-testid="nav-mobile-bottom"]',
          title: "Move around quickly",
          body: "Use the bottom bar for daily work. More contains Leaderboard, Team, Resources, and other pages.",
        },
      ];
    }
    return [
      {
        route: "/",
        title: "Welcome to BRAVE",
        body: "This short desktop tour shows where to track your team, client work, and weekly progress.",
      },
      {
        route: "/",
        selector: '[data-testid="desktop-hero"]',
        title: "Your dashboard",
        body: "See your team, verified revenue, programme progress, and current journal status at a glance.",
      },
      {
        route: pipelineRoute,
        selector: "main",
        title: pipelineName,
        body:
          pipelineName === "Leads"
            ? "Use Leads to capture client conversations and move qualified work toward payment."
            : "Use Projects to organise delivery and submit revenue evidence.",
      },
      {
        route: "/journal",
        selector: '[data-testid="journal-week-picker"]',
        title: "Weekly Journal",
        body: "Select a programme week, record activity, and keep your team’s progress current.",
      },
      {
        route: "/",
        selector: '[data-testid="sidebar-season-badge"]',
        title: "Everything stays within reach",
        body: "Use the sidebar to open Leaderboard, Team, Resources, and switch between available seasons.",
      },
    ];
  }, [pipelineName, pipelineRoute, platform]);

  const enabled =
    user?.role === "student" &&
    !!user.termsAcceptedAt;

  const progress = useQuery({
    queryKey: ["product-tour", user?.id, platform],
    queryFn: () => getProductTourProgress(platform),
    enabled,
    staleTime: Infinity,
  });

  const save = useMutation({
    mutationFn: (status: "finished" | "dismissed") =>
      saveProductTourProgress(platform, status),
  });

  useEffect(() => {
    if (!enabled || progress.data?.status !== "unseen") return;
    try {
      if (sessionStorage.getItem(sessionKey) === "hidden") return;
    } catch {
      // Continue; the database is still the source of truth.
    }
    const timer = window.setTimeout(() => setVisible(true), 900);
    return () => window.clearTimeout(timer);
  }, [enabled, progress.data?.status, sessionKey]);

  const step = steps[stepIndex];

  useEffect(() => {
    if (!visible || !step) return;
    if (location !== step.route) {
      setLocation(step.route);
    }
  }, [location, setLocation, step, visible]);

  useEffect(() => {
    if (!visible || !step?.selector) return;
    let cleanup = () => {};
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(step.selector!);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      const previous = {
        position: target.style.position,
        zIndex: target.style.zIndex,
        outline: target.style.outline,
        outlineOffset: target.style.outlineOffset,
      };
      if (getComputedStyle(target).position === "static") {
        target.style.position = "relative";
      }
      target.style.zIndex = "101";
      target.style.outline = "3px solid #FFC400";
      target.style.outlineOffset = "4px";
      cleanup = () => {
        target.style.position = previous.position;
        target.style.zIndex = previous.zIndex;
        target.style.outline = previous.outline;
        target.style.outlineOffset = previous.outlineOffset;
      };
    }, 220);
    return () => {
      window.clearTimeout(timer);
      cleanup();
    };
  }, [step, visible]);

  if (!visible || !step) return null;

  const finish = (status: "finished" | "dismissed") => {
    setVisible(false);
    try {
      sessionStorage.setItem(sessionKey, "hidden");
    } catch {
      // The current state still closes the tour.
    }
    save.mutate(status);
    if (status === "finished") setLocation("/");
  };

  const isLast = stepIndex === steps.length - 1;

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/55" aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="BRAVE product tour"
        data-testid="product-tour"
        className={
          platform === "mobile"
            ? "fixed inset-x-3 bottom-[calc(1rem+var(--safe-area-inset-bottom,0px))] z-[110] rounded-2xl border border-white/20 bg-white p-4 text-[#2B090C] shadow-2xl"
            : "fixed right-6 top-1/2 z-[110] w-[360px] -translate-y-1/2 rounded-2xl border bg-white p-5 text-[#2B090C] shadow-2xl"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#630B12] text-[#FFC400]">
              <Compass className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A6F66]">
                Quick tour · {stepIndex + 1} of {steps.length}
              </p>
              <h2 className="text-base font-extrabold leading-tight">
                {step.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => finish("dismissed")}
            aria-label="Close tour and do not show again"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#6B4F47] hover:bg-[#FFF5F5]"
            data-testid="button-dismiss-product-tour"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-5 text-[#6B4F47]">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === stepIndex
                    ? "w-5 bg-[#A81B22]"
                    : "w-1.5 bg-[#E7DAD4]"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((value) => value - 1)}
                className="inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-sm font-bold"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                isLast
                  ? finish("finished")
                  : setStepIndex((value) => value + 1)
              }
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#630B12] px-4 text-sm font-bold text-white"
              data-testid={
                isLast
                  ? "button-finish-product-tour"
                  : "button-next-product-tour"
              }
            >
              {isLast ? (
                <>
                  Finish <Check className="h-4 w-4" aria-hidden="true" />
                </>
              ) : (
                <>
                  Next <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}