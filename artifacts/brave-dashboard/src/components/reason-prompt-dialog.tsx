import { useState, useEffect, useId } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

export type ReasonPromptDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  submitVariant?: "default" | "destructive";
  isSubmitting?: boolean;
  onSubmit: (reason: string) => void | Promise<void>;
};

export function ReasonPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label = "Reason",
  placeholder = "Provide a clear reason...",
  submitLabel = "Submit",
  submitVariant = "default",
  isSubmitting = false,
  onSubmit,
}: ReasonPromptDialogProps) {
  const [reason, setReason] = useState("");
  const fieldId = useId();

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor={fieldId} className="text-sm font-medium">
              {label}
            </label>
            <Textarea
              id={fieldId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={placeholder}
              rows={4}
              autoFocus
              data-testid="textarea-reason"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={submitVariant}
              disabled={!canSubmit}
              data-testid="button-submit-reason"
            >
              {isSubmitting && <Spinner className="w-4 h-4 mr-2" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
