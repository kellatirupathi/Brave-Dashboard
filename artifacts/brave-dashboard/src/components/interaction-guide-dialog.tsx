// "How to write an interaction" — the coaching modal behind the Leads detail
// page's Interactions header.
//
// Students under-log: a whole client relationship arrives at review as three
// rows saying "called". That is not a fraud problem, it is a writing problem —
// nobody told them what a reviewer needs to see. So this explains the shape of
// a good entry, then shows a do / don't pair for the same visit so the
// difference is concrete rather than abstract.
//
// The animation is deliberate and slow enough to read: the weak note types
// itself out, is marked as thin, then the strong note builds line by line. A
// student who watches it once should know what to type without reading a word
// of the prose above it.
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Check,
  X,
  RotateCcw,
  CalendarDays,
  MessageSquareQuote,
  Flag,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** The four things a reviewer looks for in a single logged interaction. */
const INGREDIENTS = [
  {
    icon: CalendarDays,
    title: "The real date",
    body: "Log it on the day it happened. Distinct dates are what count — five messages in one afternoon is still one day of contact.",
  },
  {
    icon: MessageSquareQuote,
    title: "What they actually said",
    body: "Their words, not your summary of your own effort. Quote the objection, the number they pushed back on, the feature they asked for.",
  },
  {
    icon: Flag,
    title: "What happens next",
    body: "End with the agreed next step and who owns it. A trail with no next step reads as a relationship that stopped.",
  },
  {
    icon: Paperclip,
    title: "Proof, when you have it",
    body: "Attach the quotation, the screenshot, the photo from the shop. One attachment is worth a paragraph of description.",
  },
] as const;

/** The weak note, typed out character by character. */
const WEAK_NOTE = "Called the client. Discussed. Will follow up.";

/** The strong note, revealed one line at a time. */
const STRONG_LINES = [
  "Visited the shop at 4pm. Owner Ramesh showed me the",
  "billing register — still fully on paper, ~40 bills a day.",
  'He said "I lose two hours every night just totalling".',
  "Pushed back on ₹15,000, wants it under ₹10,000.",
  "Next: I send a 2-phase quote by Friday. He will decide",
  "after speaking to his brother, who funds the shop.",
] as const;

type Phase = "weak" | "verdict" | "strong" | "done";

export function InteractionGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("weak");
  const [typed, setTyped] = useState(0);
  const [lines, setLines] = useState(0);
  // Bumping this remounts the animation subtree so "Play again" restarts it.
  const [runId, setRunId] = useState(0);

  // Reset whenever the dialog opens, so a second visit replays the lesson
  // rather than showing the finished state.
  useEffect(() => {
    if (!open) return;
    if (reduceMotion) {
      setPhase("done");
      setTyped(WEAK_NOTE.length);
      setLines(STRONG_LINES.length);
      return;
    }
    setPhase("weak");
    setTyped(0);
    setLines(0);
  }, [open, runId, reduceMotion]);

  // Phase 1 — type the weak note out.
  useEffect(() => {
    if (!open || reduceMotion || phase !== "weak") return;
    if (typed >= WEAK_NOTE.length) {
      const t = setTimeout(() => setPhase("verdict"), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTyped((n) => n + 1), 38);
    return () => clearTimeout(t);
  }, [open, reduceMotion, phase, typed]);

  // Phase 2 — hold on the verdict, then start building the strong note.
  useEffect(() => {
    if (!open || reduceMotion || phase !== "verdict") return;
    const t = setTimeout(() => setPhase("strong"), 1100);
    return () => clearTimeout(t);
  }, [open, reduceMotion, phase]);

  // Phase 3 — reveal the strong note one line at a time.
  useEffect(() => {
    if (!open || reduceMotion || phase !== "strong") return;
    if (lines >= STRONG_LINES.length) {
      const t = setTimeout(() => setPhase("done"), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLines((n) => n + 1), 620);
    return () => clearTimeout(t);
  }, [open, reduceMotion, phase, lines]);

  const weakSettled = phase !== "weak";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-5 text-left">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            How to write an interaction
          </DialogTitle>
          <DialogDescription>
            A reviewer never met your client. The trail is the only thing that
            proves the relationship is real — write it so someone who wasn't
            there can follow it.
          </DialogDescription>
        </DialogHeader>

        {/* ── What goes into one entry ─────────────────────────────────── */}
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {INGREDIENTS.map((item, i) => (
            <motion.div
              key={item.title}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.06 * i, duration: 0.3 }}
              className="rounded-lg border bg-muted/40 p-3"
            >
              <div className="flex items-center gap-2">
                <item.icon
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm font-semibold">{item.title}</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </motion.div>
          ))}
        </div>

        {/* ── The same visit, written two ways ─────────────────────────── */}
        <div className="border-t bg-muted/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">The same visit, twice</h3>
              <p className="text-xs text-muted-foreground">
                Watch what a reviewer gains from the second version.
              </p>
            </div>
            {!reduceMotion && phase === "done" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRunId((n) => n + 1)}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Play again
              </Button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {/* Don't */}
            <div
              className={cn(
                "rounded-lg border-2 bg-background p-4 transition-colors duration-500",
                weakSettled ? "border-rose-300" : "border-border",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  <X className="h-3 w-3" aria-hidden="true" />
                </span>
                <p className="text-xs font-bold uppercase tracking-wide text-rose-700">
                  Don't write this
                </p>
              </div>
              <p className="mt-3 min-h-[92px] whitespace-pre-wrap font-mono text-xs leading-6 text-slate-700">
                {WEAK_NOTE.slice(0, typed)}
                {!reduceMotion && phase === "weak" ? (
                  <motion.span
                    aria-hidden="true"
                    animate={{ opacity: [1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.75 }}
                    className="inline-block w-[7px] -translate-y-px bg-slate-700 align-middle"
                    style={{ height: "0.9em" }}
                  />
                ) : null}
              </p>
              <AnimatePresence>
                {weakSettled ? (
                  <motion.ul
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-1 overflow-hidden border-t pt-3 text-xs text-rose-700"
                  >
                    <li>No date, no place, no names.</li>
                    <li>"Discussed" hides what was actually said.</li>
                    <li>"Will follow up" is not an agreed next step.</li>
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Do */}
            <div
              className={cn(
                "rounded-lg border-2 bg-background p-4 transition-colors duration-500",
                phase === "done" ? "border-emerald-400" : "border-border",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Write this instead
                </p>
              </div>
              <div className="mt-3 min-h-[92px] font-mono text-xs leading-6 text-slate-700">
                {STRONG_LINES.slice(0, lines).map((line) => (
                  <motion.p
                    key={line}
                    initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    {line}
                  </motion.p>
                ))}
                {phase === "weak" || phase === "verdict" ? (
                  <p className="text-muted-foreground">…</p>
                ) : null}
              </div>
              <AnimatePresence>
                {phase === "done" ? (
                  <motion.ul
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-1 overflow-hidden border-t pt-3 text-xs text-emerald-700"
                  >
                    <li>Dated, placed, and named.</li>
                    <li>Their words and their real objection (₹15,000).</li>
                    <li>A next step with an owner and a deadline.</li>
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            <strong>One last thing:</strong> log it on the day it happened.
            Writing up six visits the night before review is visible in the
            record, and it reads as weaker evidence than a thin trail written
            honestly as it went.
          </p>
        </div>

        <div className="flex justify-end border-t p-4">
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
