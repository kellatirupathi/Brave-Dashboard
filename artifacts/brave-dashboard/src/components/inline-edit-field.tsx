import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type InlineEditFieldProps = {
  value: string;
  placeholder?: string;
  editable: boolean;
  onSave: (next: string) => Promise<void> | void;
  /** Visual classes applied to both the display and the input so they look the same. */
  className?: string;
  /** Extra classes applied only when the field is empty (shows placeholder styling). */
  emptyClassName?: string;
  maxLength?: number;
  ariaLabel: string;
  testId?: string;
  /** If true, an empty submitted value reverts to the previous value instead of saving. */
  required?: boolean;
};

/**
 * Click-to-edit text field. Shows as styled text when not editing.
 * Save with Enter or blur. Cancel with Escape. Read-only when `editable` is false.
 */
export function InlineEditField({
  value,
  placeholder,
  editable,
  onSave,
  className,
  emptyClassName,
  maxLength,
  ariaLabel,
  testId,
  required = false,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Synchronous guard so an Enter-then-blur (or any double-trigger of commit
  // while the first save is mid-flight) only calls onSave once. `saving` is
  // a useState and is not visible until React re-renders, leaving a small
  // window where two commits could both pass an `if (!saving)` check.
  const committingRef = useRef(false);

  // Keep draft in sync when the upstream value changes (e.g. after a refetch).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Focus + select all on enter-edit.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!editable) {
    // Read-only path: render the value (or nothing if empty — keeps the same
    // markup non-leaders saw before this component was introduced).
    if (!value) return null;
    return (
      <span className={className} data-testid={testId}>
        {value}
      </span>
    );
  }

  const isEmpty = !value;

  const commit = async () => {
    // Idempotency guard: only the first commit in a given edit session runs.
    if (committingRef.current) return;
    committingRef.current = true;
    try {
      const next = draft.trim();
      // Empty value when required: revert without saving.
      if (required && !next) {
        setDraft(value);
        setEditing(false);
        return;
      }
      // No change: just exit edit mode.
      if (next === value) {
        setEditing(false);
        return;
      }
      setSaving(true);
      try {
        await onSave(next);
        setEditing(false);
      } catch {
        // onSave is responsible for surfacing errors via toast; on failure we
        // revert the draft and exit edit mode so the user can retry.
        setDraft(value);
        setEditing(false);
      } finally {
        setSaving(false);
      }
    } finally {
      committingRef.current = false;
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-2 w-full">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (!saving) void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          maxLength={maxLength}
          aria-label={ariaLabel}
          disabled={saving}
          data-testid={testId ? `${testId}-input` : undefined}
          className={cn(
            "bg-transparent border-b border-primary/60 focus:border-primary outline-none w-full px-0 py-0",
            className,
          )}
        />
        {saving ? <Spinner className="w-4 h-4 shrink-0" /> : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${ariaLabel} — click to edit`}
      data-testid={testId}
      className={cn(
        "group/inline inline-flex items-center gap-2 max-w-full text-left rounded-md px-1 -mx-1 py-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-text",
        className,
        isEmpty && (emptyClassName ?? "text-muted-foreground italic font-normal"),
      )}
    >
      <span className="truncate">{isEmpty ? placeholder : value}</span>
      <Pencil className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover/inline:opacity-60 transition-opacity" />
    </button>
  );
}
