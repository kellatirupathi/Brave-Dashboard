import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// "Rows per page" options for the admin list paginations.
const PAGE_SIZE_OPTIONS = [100, 300, 500, 1000];

// A small, reusable page-size dropdown for the admin paginated lists. Purely
// additive: each page owns its own pageSize state and passes it in — this only
// renders the selector and reports changes back.
export function PageSizeSelect({
  value,
  onChange,
  testId,
}: {
  value: number;
  onChange: (size: number) => void;
  testId?: string;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger
        className="h-8 w-[110px] text-sm"
        aria-label="Rows per page"
        data-testid={testId}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAGE_SIZE_OPTIONS.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n} / page
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
