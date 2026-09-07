// A small rich-text editor for ticket resolutions (additive, isolated).
//
// WHY contentEditable RATHER THAN A LIBRARY. The toolbar is six buttons and a
// link prompt. Pulling in a full editor would add a large dependency to one
// modal, and every tag it can produce would then need adding to the server's
// allow-list. A contentEditable surface driven by execCommand produces exactly
// the tags lib/sanitize-html.ts already accepts, so the two ends stay matched.
//
// execCommand is deprecated but is still implemented in every browser this
// dashboard supports, and there is no replacement API for formatting a
// selection. If it ever stops working the fallback is graceful: the field
// keeps accepting text, only the formatting buttons go quiet.
import { useCallback, useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
};

type ToolbarButton = {
  label: string;
  icon: typeof Bold;
  command: string;
  arg?: string;
};

const BUTTONS: ToolbarButton[] = [
  { label: "Bold", icon: Bold, command: "bold" },
  { label: "Italic", icon: Italic, command: "italic" },
  { label: "Underline", icon: Underline, command: "underline" },
  { label: "Strikethrough", icon: Strikethrough, command: "strikeThrough" },
  { label: "Bulleted list", icon: List, command: "insertUnorderedList" },
  { label: "Numbered list", icon: ListOrdered, command: "insertOrderedList" },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  ...rest
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Write `value` in only when it differs from what the element already holds.
  // Assigning innerHTML on every render would move the caret to the start on
  // each keystroke, because React's value and the DOM's are the same string
  // arriving by different routes.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  const emit = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML);
  }, [onChange]);

  const run = useCallback(
    (command: string, arg?: string) => {
      // Focus first: execCommand acts on the document selection, which is not
      // inside the editor while the toolbar button has focus.
      ref.current?.focus();
      document.execCommand(command, false, arg);
      emit();
    },
    [emit],
  );

  const addLink = useCallback(() => {
    const url = window.prompt("Link address", "https://");
    if (!url) return;
    // Only http(s) and mailto survive the server's sanitiser, so refuse the
    // rest here rather than letting the author write a link that silently
    // disappears on save.
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      window.alert("Links must start with http://, https:// or mailto:");
      return;
    }
    run("createLink", url.trim());
  }, [run]);

  const isEmpty = !value || value === "<br>" || value === "<p></p>";

  return (
    <div
      className={cn("rounded-md border border-input bg-background", className)}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input px-2 py-1.5">
        {BUTTONS.map((b) => (
          <button
            key={b.command}
            type="button"
            // Keeps the selection in the editor: without this the button steals
            // focus on mousedown and execCommand has nothing to format.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(b.command, b.arg)}
            title={b.label}
            aria-label={b.label}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <b.icon className="w-4 h-4" />
          </button>
        ))}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addLink}
          title="Add link"
          aria-label="Add link"
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Link2 className="w-4 h-4" />
        </button>
      </div>

      <div className="relative">
        {isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder ?? "Rich text"}
          onInput={emit}
          onBlur={emit}
          // Paste as plain text: whatever formatting came from the source
          // document would mostly be stripped on save anyway, and pasting a
          // wall of foreign markup makes the field behave unpredictably.
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
          className="min-h-[160px] max-h-[360px] overflow-y-auto px-3 py-2.5 text-sm outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline"
          data-testid={rest["data-testid"]}
        />
      </div>
    </div>
  );
}
