import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

type SpinnerProps = Omit<React.ComponentProps<"svg">, "size"> & {
  size?: "sm" | "md" | "lg" | "xl" | number
}

function Spinner({ className, size, ...props }: SpinnerProps) {
  const numericSize = typeof size === "number" ? size : undefined

  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      size={numericSize}
      className={cn(numericSize ? "animate-spin" : "size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
