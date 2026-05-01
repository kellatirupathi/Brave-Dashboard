import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MIN_PASSWORD_LENGTH = 8;

type Mode =
  | { kind: "self" }
  | { kind: "admin"; targetUserId: string; targetLabel: string };

export function ChangePasswordDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
}) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the dialog re-opens so values don't linger.
  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (mode.kind === "self" && currentPassword.length === 0) {
      setError("Enter your current password.");
      return;
    }

    setSubmitting(true);
    try {
      const url =
        mode.kind === "self"
          ? "/api/auth/change-password"
          : `/api/admin/users/${encodeURIComponent(mode.targetUserId)}/password`;
      const body =
        mode.kind === "self"
          ? { currentPassword, newPassword }
          : { password: newPassword };

      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let message = "Could not change password.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // ignore parse errors
        }
        setError(message);
        setSubmitting(false);
        return;
      }
      toast({
        title:
          mode.kind === "self"
            ? "Password updated"
            : `Password updated for ${mode.targetLabel}`,
      });
      onOpenChange(false);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  const title =
    mode.kind === "self"
      ? "Change password"
      : `Set password for ${mode.targetLabel}`;
  const description =
    mode.kind === "self"
      ? "Enter your current password, then choose a new one."
      : "Set or reset this account's email + password sign-in.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-change-password">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {mode.kind === "self" && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">Current password</Label>
              <PasswordField
                id="cp-current"
                value={currentPassword}
                onChange={setCurrentPassword}
                show={showCurrent}
                onToggle={() => setShowCurrent((v) => !v)}
                disabled={submitting}
                autoComplete="current-password"
                testId="input-cp-current"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cp-new">New password</Label>
            <PasswordField
              id="cp-new"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggle={() => setShowNew((v) => !v)}
              disabled={submitting}
              autoComplete="new-password"
              testId="input-cp-new"
            />
            <p className="text-xs text-muted-foreground">
              Minimum {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <PasswordField
              id="cp-confirm"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
              disabled={submitting}
              autoComplete="new-password"
              testId="input-cp-confirm"
            />
          </div>

          {error && (
            <p
              className="text-sm text-destructive"
              role="alert"
              data-testid="text-cp-error"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              data-testid="button-cp-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                !newPassword ||
                !confirmPassword ||
                (mode.kind === "self" && !currentPassword)
              }
              data-testid="button-cp-submit"
            >
              {submitting && <Spinner className="w-4 h-4 mr-2" />}
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordField({
  id,
  value,
  onChange,
  show,
  onToggle,
  disabled,
  autoComplete,
  testId,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  show: boolean;
  onToggle: () => void;
  disabled?: boolean;
  autoComplete?: string;
  testId?: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="pr-10"
        data-testid={testId}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
