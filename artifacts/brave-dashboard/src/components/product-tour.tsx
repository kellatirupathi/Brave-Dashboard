import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  const [cardPosition, setCardPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const cardRef = useRef<HTMLElement>(null);
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
          selector: '[data-tour="student-pipeline"]',
          title: pipelineName,
          body:
            pipelineName === "Leads"
              ? "Capture real client conversations here, then move qualified work into delivery and payment."
              : "Create projects and keep revenue evidence organised here.",
        },
        {
          route: "/journal",
          selector:
            '[data-testid="journal-week-picker"], [data-tour="journal-empty-state"]',
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
        selector: '[data-tour="student-pipeline"]',
        title: pipelineName,
        body:
          pipelineName === "Leads"
            ? "Use Leads to capture client conversations and move qualified work toward payment."
            : "Use Projects to organise delivery and submit revenue evidence.",
      },
      {
        route: "/journal",
        selector:
          '[data-testid="journal-week-picker"], [data-tour="journal-empty-state"]',
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

  useLayoutEffect(() => {
    if (!visible) return;

    const margin = platform === "mobile" ? 12 : 20;
    const gap = platform === "mobile" ? 12 : 16;
    let retryTimer = 0;
    let attempts = 0;

    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), Math.max(min, max));

    const updatePosition = () => {
      const card = cardRef.current;
      if (!card) return;

      const cardRect = card.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const target = step.selector
        ? document.querySelector<HTMLElement>(step.selector)
        : null;

      if (!target && step.selector && attempts < 12) {
        attempts += 1;
        retryTimer = window.setTimeout(updatePosition, 120);
        return;
      }

      if (!target) {
        setCardPosition({
          top:
            platform === "mobile"
              ? Math.max(margin, viewportHeight - cardRect.height - margin)
              : Math.max(margin, (viewportHeight - cardRect.height) / 2),
          left:
            platform === "mobile"
              ? Math.max(margin, (viewportWidth - cardRect.width) / 2)
              : Math.max(margin, viewportWidth - cardRect.width - margin),
        });
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const horizontalCenter = targetRect.left + targetRect.width / 2;
      const verticalCenter = targetRect.top + targetRect.height / 2;
      const positions = {
        top: {
          top: targetRect.top - cardRect.height - gap,
          left: clamp(
            horizontalCenter - cardRect.width / 2,
            margin,
            viewportWidth - cardRect.width - margin,
          ),
        },
        bottom: {
          top: targetRect.bottom + gap,
          left: clamp(
            horizontalCenter - cardRect.width / 2,
            margin,
            viewportWidth - cardRect.width - margin,
          ),
        },
        left: {
          top: clamp(
            verticalCenter - cardRect.height / 2,
            margin,
            viewportHeight - cardRect.height - margin,
          ),
          left: targetRect.left - cardRect.width - gap,
        },
        right: {
          top: clamp(
            verticalCenter - cardRect.height / 2,
            margin,
            viewportHeight - cardRect.height - margin,
          ),
          left: targetRect.right + gap,
        },
      } as const;

      const fits = (position: { top: number; left: number }) =>
        position.top >= margin &&
        position.left >= margin &&
        position.top + cardRect.height <= viewportHeight - margin &&
        position.left + cardRect.width <= viewportWidth - margin;

      const availableSpace = {
        top: targetRect.top - margin,
        bottom: viewportHeight - targetRect.bottom - margin,
        left: targetRect.left - margin,
        right: viewportWidth - targetRect.right - margin,
      };
      const order = (Object.keys(availableSpace) as Array<
        keyof typeof availableSpace
      >).sort((a, b) => availableSpace[b] - availableSpace[a]);
      const placement =
        order.map((side) => positions[side]).find(fits) ??
        positions[order[0]];

      setCardPosition({
        top: clamp(
          placement.top,
          margin,
          viewportHeight - cardRect.height - margin,
        ),
        left: clamp(
          placement.left,
          margin,
          viewportWidth - cardRect.width - margin,
        ),
      });
    };

    setCardPosition(null);
    retryTimer = window.setTimeout(updatePosition, 80);
    const handleViewportChange = () => updatePosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, { passive: true });

    return () => {
      window.clearTimeout(retryTimer);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange);
    };
  }, [location, platform, step, visible]);

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
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="BRAVE product tour"
        data-testid="product-tour"
        className={
          platform === "mobile"
            ? "fixed z-[110] w-[min(calc(100vw-24px),390px)] rounded-2xl border border-white/20 bg-white p-4 text-[#2B090C] shadow-2xl"
            : "fixed z-[110] w-[360px] rounded-2xl border bg-white p-5 text-[#2B090C] shadow-2xl"
        }
        style={{
          top: cardPosition?.top ?? 0,
          left: cardPosition?.left ?? 0,
          opacity: cardPosition ? 1 : 0,
        }}
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