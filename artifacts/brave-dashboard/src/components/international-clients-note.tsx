// Clarifies that students may work with international (incl. U.S.) clients and
// lists the accepted payment methods. Shown on the Projects page. Additive +
// self-contained.
import { Globe, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS = [
  "Bank / wire transfer",
  "PayPal",
  "Wise (TransferWise)",
  "UPI / Razorpay (domestic)",
];

export function InternationalClientsNote({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-xl border bg-card p-4", className)}
      data-testid="international-clients-note"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
          <Globe className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            Working with international clients
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            You can work with clients anywhere in the world — including the U.S.
            and other international businesses. Revenue from international
            clients counts the same as domestic revenue once it's verified.
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" /> Accepted payment methods
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <span
                key={m}
                className="rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
