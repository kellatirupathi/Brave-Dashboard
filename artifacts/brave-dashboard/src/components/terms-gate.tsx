import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useAuth } from "@workspace/replit-auth-web";
import {
  DialogOverlay,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { acceptTerms } from "@/lib/terms-api";

// Legal links opened from statement 3. Open in a new tab.
const TERMS_URL =
  "https://www.niatindia.com/terms-and-conditions?_gl=1*6gubda*_gcl_au*MjA5MjQ1NzUwMy4xNzU2OTg0MjE2";
const PRIVACY_URL =
  "https://www.ccbp.in/privacy-policy?utm_source=niatindia-website&utm_medium=website&utm_campaign=footer-legal-privacy-policy&invite_code=TP3YSU";
// Dedicated Code of Conduct page not provided yet — reuse the NIAT T&C page.
const CODE_OF_CONDUCT_URL = TERMS_URL;

function TermsLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
    >
      {children}
    </a>
  );
}

// Blocking, non-dismissible Terms & Conditions consent gate. Mounted once in
// the app shell. Shown ONLY for students who have not yet accepted. There is
// no close (X), Escape, or click-outside — the only way out is to accept.
export function TermsGate() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const shouldShow = user?.role === "student" && !user.termsAcceptedAt;
  if (!shouldShow) return null;

  const handleAgree = async () => {
    setSubmitting(true);
    try {
      await acceptTerms();
      // Refresh the cached current user so termsAcceptedAt is now set; the
      // gate then unmounts itself because shouldShow becomes false.
      await refresh();
    } catch {
      toast({
        title: "Couldn't save your acceptance",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
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
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg",
            "max-h-[90vh] overflow-y-auto",
          )}
          data-testid="dialog-terms-gate"
        >
          <DialogHeader>
            <DialogTitle>Terms &amp; Conditions</DialogTitle>
            <DialogDescription>
              Please read and accept the following to continue.
            </DialogDescription>
          </DialogHeader>

          <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-foreground">
            <li>
              I acknowledge that NxtWave bears no responsibility or liability for
              any commercial, financial, or contractual arrangements, payments,
              or disputes arising from my client engagements under this program.
            </li>
            <li>
              I agree not to misrepresent NxtWave, including its brand, programs,
              or offerings, to any client or third party. I understand that any
              such misrepresentation may result in immediate termination from
              this program and may attract further legal or disciplinary action
              as deemed appropriate by NxtWave.
            </li>
            <li>
              I have read, understood, and unconditionally agree to the{" "}
              <TermsLink href={TERMS_URL}>
                NIAT Program Terms &amp; Conditions
              </TermsLink>
              , <TermsLink href={PRIVACY_URL}>Privacy Policy</TermsLink>, and{" "}
              <TermsLink href={CODE_OF_CONDUCT_URL}>
                NIAT Code of Conduct
              </TermsLink>
              .
            </li>
          </ol>

          <DialogFooter>
            <Button
              onClick={handleAgree}
              disabled={submitting}
              data-testid="button-accept-terms"
            >
              {submitting ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Saving…
                </>
              ) : (
                "I Understand and Agree"
              )}
            </Button>
          </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
