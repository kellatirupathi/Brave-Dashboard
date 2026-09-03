// Per-field help on the Season 2 project form.
//
// Each helped field gets a small amber "what goes here" button beside its
// label. Pressing it opens a modal with the expected format, a worked example,
// and a short looping animation that SHOWS the shape of a good answer rather
// than only describing it — a student who is unsure what "live product URL"
// means learns more from watching a URL resolve than from a sentence.
//
// WHY NOT components/ui/dialog
// That dialog is used in ~40 places and has no enter/exit transition. Rather
// than change how every modal in the app behaves, this owns a small
// framer-motion modal: fades and lifts in, closes on backdrop click or Escape.
//
// Deleting this file means removing the `help` prop from the project form's
// Field components and the one <FieldHelp> beside each phase heading.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Info, X, Check, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

export type FieldHelpId =
  | "problem"
  | "solution"
  | "liveProductUrl"
  | "demoVideo"
  | "sourceCode"
  | "prototype"
  | "demoCredentials"
  | "agreement"
  | "phase";

// ── Animation primitives ────────────────────────────────────────────────────

/** Steps a value through a list on an interval, looping. */
function useCycle(length: number, ms: number): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (length <= 1) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % length), ms);
    return () => window.clearInterval(t);
  }, [length, ms]);
  return i;
}

/** Reveals `text` one character at a time, then holds, then restarts. */
function useTyping(text: string, speed = 34, hold = 1400): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let cancelled = false;
    let timer: number;
    const step = (i: number) => {
      if (cancelled) return;
      if (i <= text.length) {
        setN(i);
        timer = window.setTimeout(() => step(i + 1), speed);
      } else {
        timer = window.setTimeout(() => step(0), hold);
      }
    };
    timer = window.setTimeout(() => step(0), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, speed, hold]);
  return text.slice(0, n);
}

function Caret() {
  return (
    <motion.span
      className="ml-px inline-block h-[1em] w-[2px] translate-y-[2px] bg-primary"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
    />
  );
}

/** A sentence typing itself out — for the free-text fields. */
function TypingDemo({ text }: { text: string }) {
  const shown = useTyping(text);
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="min-h-[3.5rem] text-sm leading-relaxed">
        {shown}
        <Caret />
      </p>
    </div>
  );
}

/** Browser chrome: a URL types into the bar, the page loads, anyone can see it. */
function BrowserDemo({ url, page }: { url: string; page: string }) {
  const typed = useTyping(url, 28, 2200);
  const done = typed.length === url.length;
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
        <span className="flex gap-1">
          {["bg-rose-400", "bg-amber-400", "bg-emerald-400"].map((c) => (
            <span key={c} className={cn("h-2 w-2 rounded-full", c)} />
          ))}
        </span>
        <span className="flex-1 truncate rounded-md bg-background px-2 py-1 font-mono text-[11px]">
          {typed}
          {!done ? <Caret /> : null}
        </span>
      </div>
      <div className="relative h-24 p-3">
        <AnimatePresence>
          {done ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-2"
            >
              <div className="h-2.5 w-1/3 rounded bg-primary/30" />
              <div className="h-2 w-4/5 rounded bg-muted-foreground/20" />
              <div className="h-2 w-2/3 rounded bg-muted-foreground/20" />
              <p className="pt-1 text-[11px] font-medium text-emerald-700">
                {page}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              className="absolute inset-x-3 top-3 h-1 overflow-hidden rounded bg-muted"
            >
              <motion.span
                className="block h-full w-1/3 rounded bg-primary"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A sign-in card filling itself in — for the demo credentials field. */
function CredentialsDemo() {
  const user = useTyping("reviewer@brave.test", 40, 2600);
  const full = user.length === "reviewer@brave.test".length;
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="space-y-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Username
          </p>
          <div className="mt-0.5 rounded-md border bg-background px-2 py-1.5 font-mono text-xs">
            {user}
            {!full ? <Caret /> : null}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Password
          </p>
          <div className="mt-0.5 rounded-md border bg-background px-2 py-1.5 font-mono text-xs">
            {full ? "••••••••" : ""}
          </div>
        </div>
        <AnimatePresence>
          {full ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 text-[11px] font-medium text-emerald-700"
            >
              <Check className="h-3.5 w-3.5" />A reviewer can sign in
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A share panel flipping from Restricted to Anyone-with-the-link. */
function ShareDemo() {
  const step = useCycle(2, 2200);
  const open = step === 1;
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-xs font-medium">General access</p>
      <motion.div
        animate={{
          backgroundColor: open
            ? "rgba(16,185,129,0.10)"
            : "rgba(244,63,94,0.10)",
        }}
        transition={{ duration: 0.4 }}
        className="mt-2 flex items-center justify-between gap-3 rounded-md px-3 py-2"
      >
        <span className="flex items-center gap-2 text-sm">
          <motion.span
            key={open ? "open" : "shut"}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-white",
              open ? "bg-emerald-600" : "bg-rose-500",
            )}
          >
            {open ? <Check className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
          </motion.span>
          {open ? "Anyone with the link" : "Restricted"}
        </span>
        <span
          className={cn(
            "text-xs font-medium",
            open ? "text-emerald-700" : "text-muted-foreground",
          )}
        >
          {open ? "Viewer" : "Only you"}
        </span>
      </motion.div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {open
          ? "This is what a reviewer needs."
          : "A reviewer opening this sees “Request access”."}
      </p>
    </div>
  );
}

/** Phase bars filling in with a running total — for the phases field. */
function PhasesDemo() {
  const rows = [
    { name: "Design and content", amount: 6000 },
    { name: "Build and launch", amount: 9000 },
  ];
  const step = useCycle(rows.length + 2, 900);
  const shown = Math.min(step, rows.length);
  const total = rows.slice(0, shown).reduce((n, r) => n + r.amount, 0);
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.name}
            animate={{ opacity: i < shown ? 1 : 0.25, x: i < shown ? 0 : -6 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-2"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {i + 1}
            </span>
            <span className="flex-1 truncate text-xs">{r.name}</span>
            <span className="font-mono text-xs tabular-nums">
              ₹{r.amount.toLocaleString("en-IN")}
            </span>
          </motion.div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t pt-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Contract value
        </span>
        <motion.span
          key={total}
          initial={{ scale: 1.15, color: "#C0392B" }}
          animate={{ scale: 1, color: "currentColor" }}
          transition={{ duration: 0.3 }}
          className="font-mono text-sm font-semibold tabular-nums"
        >
          ₹{total.toLocaleString("en-IN")}
        </motion.span>
      </div>
    </div>
  );
}

// ── Content ─────────────────────────────────────────────────────────────────

type Help = {
  /** The little button's label, next to the field. */
  trigger: string;
  title: string;
  intro: string;
  animation: ReactNode;
  good: string[];
  bad: string[];
  example?: string;
};

const HELP: Record<FieldHelpId, Help> = {
  problem: {
    trigger: "How to write this",
    title: "What problem are you solving?",
    intro:
      "Write the client's problem in the client's own words, as they said it to you. A reviewer should understand it without knowing anything technical.",
    animation: (
      <TypingDemo text="Customers call to ask if a dress is in stock, and the owner has to walk to the rack every time. She loses about an hour a day and still misses calls." />
    ),
    good: [
      "Say who has the problem and how often it happens",
      "Put a number on the cost — hours, rupees, missed customers",
      "Use the words the owner used",
    ],
    bad: [
      "“They needed a website.”",
      "Naming your solution instead of their problem",
      "Technical framing the client would not recognise",
    ],
  },
  solution: {
    trigger: "How to write this",
    title: "What are you building?",
    intro:
      "Describe what the client will actually be able to do once you are done. Features, not architecture.",
    animation: (
      <TypingDemo text="A stock page the owner updates from her phone, and a WhatsApp link customers use to check availability without calling." />
    ),
    good: [
      "Name the two or three things it lets them do",
      "Say who uses it — the owner, their staff, their customers",
      "Keep it to what you are delivering this project",
    ],
    bad: [
      "“A React app with a Postgres backend.”",
      "Listing every feature you might add later",
      "Repeating the problem statement",
    ],
  },
  liveProductUrl: {
    trigger: "What counts as live",
    title: "Live product URL",
    intro:
      "The deployed, working product — the address the client and a reviewer can open right now, from their own device, without logging into your account.",
    animation: (
      <BrowserDemo
        url="https://kirana-stock.vercel.app"
        page="Opens for anyone, no sign-in"
      />
    ),
    good: [
      "A published or deployed site: Vercel, Netlify, Render, Firebase, a custom domain",
      "A published app or store listing, if that is the product",
      "Opens in a private window with no account",
    ],
    bad: [
      "localhost or an IP on your own machine",
      "A Figma file, a screenshot or a slide deck — those go in Prototype",
      "A preview link that expires, or one that asks to log in",
    ],
    example: "https://kirana-stock.vercel.app",
  },
  demoVideo: {
    trigger: "What to record",
    title: "Demo video",
    intro:
      "A short screen recording of the real product doing the real thing, so a reviewer can see it work even if the site is down later.",
    animation: (
      <BrowserDemo
        url="https://youtu.be/AbC123dEf"
        page="Unlisted — plays for anyone with the link"
      />
    ),
    good: [
      "Two to four minutes, walking through the main flow",
      "YouTube unlisted, Drive or Loom — set so anyone with the link can view",
      "Show the product, not slides about the product",
    ],
    bad: [
      "A Drive link left on “Restricted”",
      "A file you have to download to watch",
      "A recording of the code editor rather than the product",
    ],
  },
  sourceCode: {
    trigger: "What to link",
    title: "Source code",
    intro:
      "The repository the product is built from. A reviewer opens it to confirm the work is yours and recent.",
    animation: (
      <BrowserDemo
        url="https://github.com/your-team/kirana-stock"
        page="Public repository — commits visible"
      />
    ),
    good: [
      "A public GitHub or GitLab repository",
      "Commits spread over the project, not one dump at the end",
      "A short README saying what it is",
    ],
    bad: [
      "A private repository a reviewer cannot open",
      "A zip file on Drive",
      "A link to someone else's template with your name on it",
    ],
  },
  prototype: {
    trigger: "What to link",
    title: "Prototype or design",
    intro:
      "The design you worked from — wireframes, a Figma file, or the mockups you showed the client before building.",
    animation: (
      <BrowserDemo
        url="https://figma.com/file/kirana-stock"
        page="Anyone with the link — can view"
      />
    ),
    good: [
      "Figma, Canva or an image of the screens you agreed",
      "Sharing set to anyone with the link",
      "The version you actually showed the client",
    ],
    bad: [
      "A Figma file left private to your account",
      "The live product again — that goes in the field above",
    ],
  },
  demoCredentials: {
    trigger: "When to fill this",
    title: "Demo login details",
    intro:
      "Only needed when the product is behind a sign-in. Give a test account a reviewer can use — never the client's real one.",
    animation: <CredentialsDemo />,
    good: [
      "A test account made for reviewing",
      "Both the username and the password, on one line",
      "An account with enough sample data to see the product working",
    ],
    bad: [
      "The client's real login or any real customer's",
      "A username with no password",
      "Filling this in when the product is open to everyone — leave it blank",
    ],
    example: "reviewer@brave.test / Review@2026",
  },
  agreement: {
    trigger: "What to attach",
    title: "Agreement or work order",
    intro:
      "Anything that shows the client agreed to this work and this amount. A photo of a signed sheet is fine — it does not need to be a legal contract.",
    animation: <ShareDemo />,
    good: [
      "A photo or scan of the signed sheet, uploaded here",
      "A work order, quotation or proposal the client accepted",
      "If you paste a link, set sharing to anyone with the link",
    ],
    bad: [
      "A Drive link on “Restricted” — the reviewer sees “Request access”",
      "A blank template with no signature or agreed amount",
    ],
  },
  phase: {
    trigger: "How to split phases",
    title: "Phases and payments",
    intro:
      "Break the work into the stages you agreed with the client, each with the amount due for it. The amounts add up to the contract value.",
    animation: <PhasesDemo />,
    good: [
      "At least two phases, each a chunk the client would recognise",
      "Every phase carries the money due for it",
      "A due date, so delivering on time can be credited to you",
    ],
    bad: [
      "One phase for the whole project",
      "A phase with no amount, or an amount with no phase",
      "Amounts that do not match what the client agreed",
    ],
  },
};

// ── The button and its modal ────────────────────────────────────────────────

export function FieldHelp({ id }: { id: FieldHelpId }) {
  const [open, setOpen] = useState(false);
  const help = HELP[id];

  // Escape closes, and the page behind must not scroll under the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-amber-600 transition-colors hover:text-amber-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        data-testid={`field-help-${id}`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        {help.trigger}
      </button>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
                  {/* Backdrop — a click anywhere outside the panel closes. */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="absolute inset-0 bg-black/60"
                    onClick={() => setOpen(false)}
                    data-testid={`field-help-backdrop-${id}`}
                  />
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label={help.title}
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.985 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-10 max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border bg-background p-5 shadow-2xl sm:rounded-2xl"
                  >
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Close"
                      data-testid={`field-help-close-${id}`}
                    >
                      <X className="h-4 w-4" />
                    </button>

                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">
                      What goes here
                    </p>
                    <h2 className="mt-0.5 pr-8 text-lg font-bold tracking-tight">
                      {help.title}
                    </h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {help.intro}
                    </p>

                    <div className="mt-4">{help.animation}</div>

                    {help.example ? (
                      <p className="mt-3 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
                        {help.example}
                      </p>
                    ) : null}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                          Do
                        </p>
                        <ul className="space-y-1">
                          {help.good.map((g) => (
                            <li key={g} className="flex items-start gap-1.5 text-xs">
                              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                              <span>{g}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                          Avoid
                        </p>
                        <ul className="space-y-1">
                          {help.bad.map((b) => (
                            <li key={b} className="flex items-start gap-1.5 text-xs">
                              <Ban className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}
