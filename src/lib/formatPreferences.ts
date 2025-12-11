import { format } from "date-fns";
import type { UserPreferences } from "@/hooks/useUserPreferences";

/**
 * Formatting utilities that respect user preferences
 */

// Format a Date object according to user's date format preference
export function formatDate(date: Date, dateFormat: UserPreferences["dateFormat"]): string {
  switch (dateFormat) {
    case "DD/MM/YYYY":
      return format(date, "dd/MM/yyyy");
    case "MM/DD/YYYY":
      return format(date, "MM/dd/yyyy");
    case "YYYY-MM-DD":
    default:
      return format(date, "yyyy-MM-dd");
  }
}

// Format a Date for display with day name (e.g., "Monday, 15/01/2024")
export function formatDateWithDay(date: Date, dateFormat: UserPreferences["dateFormat"]): string {
  const dayName = format(date, "EEEE");
  const formattedDate = formatDateShort(date, dateFormat);
  return `${dayName}, ${formattedDate}`;
}

// Format date in short form (e.g., "Jan 15" or "15 Jan" depending on format)
export function formatDateShort(date: Date, dateFormat: UserPreferences["dateFormat"]): string {
  switch (dateFormat) {
    case "DD/MM/YYYY":
      return format(date, "d MMM");
    case "MM/DD/YYYY":
      return format(date, "MMM d");
    case "YYYY-MM-DD":
    default:
      return format(date, "MMM d");
  }
}

// Format a time string (HH:mm or HH:mm:ss) according to user's time format preference
export function formatTime(time: string | null | undefined, timeFormat: UserPreferences["timeFormat"]): string {
  if (!time) return "";
  
  // Extract hours and minutes from time string
  const [hours, minutes] = time.split(":").map(Number);
  
  if (timeFormat === "12h") {
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
  }
  
  // 24h format
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Format a time range (e.g., "09:00 – 10:00" or "9:00 AM – 10:00 AM")
export function formatTimeRange(
  startTime: string | null | undefined, 
  endTime: string | null | undefined, 
  timeFormat: UserPreferences["timeFormat"]
): string {
  const start = formatTime(startTime, timeFormat);
  const end = formatTime(endTime, timeFormat);
  
  if (start && end) {
    return `${start} – ${end}`;
  }
  return start || end || "";
}

// Format week range header (e.g., "Jan 15 – Jan 21, 2024")
export function formatWeekRange(
  weekStart: Date, 
  weekEnd: Date, 
  dateFormat: UserPreferences["dateFormat"]
): { start: string; end: string } {
  switch (dateFormat) {
    case "DD/MM/YYYY":
      return {
        start: format(weekStart, "d MMM"),
        end: format(weekEnd, "d MMM, yyyy"),
      };
    case "MM/DD/YYYY":
    case "YYYY-MM-DD":
    default:
      return {
        start: format(weekStart, "MMM d"),
        end: format(weekEnd, "MMM d, yyyy"),
      };
  }
}
