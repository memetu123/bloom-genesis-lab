import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Status Filter Component
 * Dropdown to filter by status (active, completed, archived)
 */

export type StatusFilterValue = "active" | "completed" | "archived" | "all";

interface StatusFilterProps {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
  showAll?: boolean;
}

const StatusFilter = ({ value, onChange, showAll = false }: StatusFilterProps) => {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StatusFilterValue)}>
      <SelectTrigger className="w-[130px] h-8 text-xs">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="completed">Completed</SelectItem>
        <SelectItem value="archived">Archived</SelectItem>
        {showAll && <SelectItem value="all">All</SelectItem>}
      </SelectContent>
    </Select>
  );
};

export default StatusFilter;
