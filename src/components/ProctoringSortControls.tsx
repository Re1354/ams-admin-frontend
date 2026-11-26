import { ArrowUpDown, Check, RotateCcw } from "lucide-react";

import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

/** Sort choices understood by the Proctoring list API (`ordering`). */
export type SessionOrdering =
  | "conduct"
  | "newest"
  | "oldest"
  | "serial_asc"
  | "serial_desc"
  | "name_asc"
  | "name_desc"
  | "flags_desc"
  | "flags_asc";

/** Most serious first: banned, reported, not monitored, clear (newest first within each). */
export const DEFAULT_ORDERING: SessionOrdering = "conduct";

interface SortGroup {
  label: string;
  width: string;
  active: string;
  check: string;
  options: { value: SessionOrdering; label: string }[];
}

// Same look as the Sort & Filter bar on the Results pages.
const GROUPS: SortGroup[] = [
  {
    label: "Exam Conduct",
    width: "w-[150px]",
    active: "border-red-400 bg-red-50/50 text-red-700 ring-1 ring-red-200",
    check: "text-red-600",
    options: [{ value: "conduct", label: "Most serious first" }],
  },
  {
    label: "Date & Time",
    width: "w-[140px]",
    active: "border-emerald-400 bg-emerald-50/50 text-emerald-700 ring-1 ring-emerald-200",
    check: "text-emerald-600",
    options: [
      { value: "newest", label: "Newest → Oldest" },
      { value: "oldest", label: "Oldest → Newest" },
    ],
  },
  {
    label: "Application Serial",
    width: "w-[110px]",
    active: "border-blue-400 bg-blue-50/50 text-blue-700 ring-1 ring-blue-200",
    check: "text-blue-600",
    options: [
      { value: "serial_asc", label: "A → Z" },
      { value: "serial_desc", label: "Z → A" },
    ],
  },
  {
    label: "Name",
    width: "w-[110px]",
    active: "border-indigo-400 bg-indigo-50/50 text-indigo-700 ring-1 ring-indigo-200",
    check: "text-indigo-600",
    options: [
      { value: "name_asc", label: "A → Z" },
      { value: "name_desc", label: "Z → A" },
    ],
  },
  {
    label: "Flags",
    width: "w-[140px]",
    active: "border-amber-400 bg-amber-50/50 text-amber-800 ring-1 ring-amber-200",
    check: "text-amber-600",
    options: [
      { value: "flags_desc", label: "Most → Fewest" },
      { value: "flags_asc", label: "Fewest → Most" },
    ],
  },
];

interface ProctoringSortControlsProps {
  ordering: SessionOrdering;
  onOrderingChange: (ordering: SessionOrdering) => void;
  disabled?: boolean;
}

/** One sort at a time: choosing in one box clears the others. */
export function ProctoringSortControls({ ordering, onOrderingChange, disabled = false }: ProctoringSortControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-slate-700">
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span className="text-[11px] font-bold uppercase tracking-wider">Sort</span>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2">
        {GROUPS.map((group) => {
          const isActive = group.options.some((option) => option.value === ordering);
          return (
            <div key={group.label} className="flex items-center gap-2">
              <Label className="whitespace-nowrap text-xs font-medium text-slate-600">{group.label}</Label>
              <Select
                value={isActive ? ordering : ""}
                onValueChange={(value) => value && onOrderingChange(value as SessionOrdering)}
                disabled={disabled}
              >
                <SelectTrigger
                  aria-label={`Sort by ${group.label}`}
                  className={`h-8 text-xs ${group.width} ${
                    isActive ? group.active : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {isActive ? <Check className={`h-3.5 w-3.5 ${group.check}`} /> : null}
                    <SelectValue placeholder="Select..." />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {group.options.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {ordering !== DEFAULT_ORDERING ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOrderingChange(DEFAULT_ORDERING)}
          disabled={disabled}
          className="ml-auto h-7 px-2 text-[11px] text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Reset
        </Button>
      ) : null}
    </div>
  );
}

export default ProctoringSortControls;
