import { useState } from "react";
import { Star } from "lucide-react";
import { useSubmitFeedback } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comments, setComments] = useState("");

  const submit = useSubmitFeedback({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Thanks for your feedback!",
          description: "We appreciate you helping us improve the platform.",
        });
        setRating(0);
        setHover(0);
        setComments("");
        onOpenChange(false);
      },
      onError: () => {
        toast({
          title: "Could not submit feedback",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      },
    },
  });

  const handleSubmit = () => {
    if (rating < 1) return;
    submit.mutate({
      data: {
        rating,
        comments: comments.trim() ? comments.trim() : null,
      },
    });
  };

  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setRating(0);
          setHover(0);
          setComments("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Share your feedback</DialogTitle>
          <DialogDescription>
            Rate your experience with the BRAVE Dashboard and tell us what we
            can improve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <p className="text-sm font-medium mb-2">
              How would you rate the platform?
            </p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (hover || rating) >= n;
                return (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    className="p-1 rounded transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                    data-testid={`feedback-star-${n}`}
                  >
                    <Star
                      className={cn(
                        "h-8 w-8 transition-colors",
                        active
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                );
              })}
              <span className="ml-3 text-sm text-muted-foreground min-w-[70px]">
                {labels[hover || rating]}
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="feedback-comments"
              className="text-sm font-medium block mb-2"
            >
              Comments{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <Textarea
              id="feedback-comments"
              placeholder="What did you like? What could be better? Any bugs you faced?"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={5}
              maxLength={2000}
              data-testid="feedback-comments"
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {comments.length}/2000
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submit.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={rating < 1 || submit.isPending}
            data-testid="feedback-submit"
          >
            {submit.isPending ? "Submitting..." : "Submit feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
