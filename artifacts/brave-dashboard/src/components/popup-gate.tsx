import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  DialogOverlay,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fetchPendingPopups, ackPopup } from "@/lib/popups-api";

const PENDING_KEY = ["pending-popups"];

// Admin-managed student pop-ups. Shows enabled pop-ups the student hasn't
// acknowledged yet, ONE AT A TIME — confirming one immediately reveals the
// next. Only mounts for students, and only after the Terms & Conditions gate
// is satisfied so the two never overlap. Entirely separate from that gate.
export function PopupGate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const eligible = user?.role === "student" && !!user.termsAcceptedAt;

  const { data: pending } = useQuery({
    queryKey: PENDING_KEY,
    queryFn: fetchPendingPopups,
    enabled: eligible,
    staleTime: 30_000,
  });

  const current = pending && pending.length > 0 ? pending[0] : null;

  // Reset the checkbox whenever the visible pop-up changes.
  useEffect(() => {
    setChecked(false);
  }, [current?.id]);

  if (!eligible || !current) return null;

  const canConfirm = !current.requireCheckbox || checked;

  const handleConfirm = async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    try {
      await ackPopup(current.id);
      // Refetch pending — the confirmed pop-up drops out and the next one (if
      // any) becomes current and is shown immediately.
      await queryClient.invalidateQueries({ queryKey: PENDING_KEY });
    } catch {
      toast({
        title: "Couldn't save your confirmation",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogPrimitive.Root open modal>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg",
            "max-h-[90vh] overflow-y-auto",
          )}
          data-testid="dialog-popup-gate"
        >
          <DialogHeader>
            <DialogTitle>{current.name}</DialogTitle>
          </DialogHeader>

          <div className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {current.message}
          </div>

          {current.requireCheckbox && (
            <label className="flex items-start gap-3 cursor-pointer text-sm">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => setChecked(v === true)}
                className="mt-0.5 shrink-0"
                data-testid="checkbox-popup-confirm"
              />
              <span>{current.checkboxLabel || "I confirm the above."}</span>
            </label>
          )}

          <DialogFooter>
            <Button
              onClick={handleConfirm}
              disabled={submitting || !canConfirm}
              data-testid="button-popup-confirm"
            >
              {submitting ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Saving…
                </>
              ) : (
                "Confirmed"
              )}
            </Button>
          </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
