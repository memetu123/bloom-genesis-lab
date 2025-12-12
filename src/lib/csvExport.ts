import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

/**
 * CSV Export utility for Todayoum
 * Generates two CSV files:
 * 1. Task Log - execution-focused (one row per task occurrence)
 * 2. Inventory - structure-focused (one row per task)
 */

// Helper to escape CSV values
function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper to format time (HH:MM)
function formatTime(time: string | null): string {
  if (!time) return "";
  // time is stored as "HH:MM:SS" or "HH:MM"
  return time.substring(0, 5);
}

// Helper to determine task nature
function getTaskNature(commitmentType: string | null): string {
  return commitmentType === "habit" ? "Habit" : "One-off";
}

// Helper to determine recurrence pattern
function getRecurrencePattern(commitment: any): string {
  if (!commitment) return "None";
  
  const recurrenceType = commitment.recurrence_type;
  const daysOfWeek = commitment.repeat_days_of_week;
  const timesPerDay = commitment.times_per_day || 1;
  
  if (recurrenceType === "daily") {
    return timesPerDay > 1 ? `Daily (${timesPerDay}x)` : "Daily";
  }
  
  if (recurrenceType === "weekly" && daysOfWeek && daysOfWeek.length > 0) {
    if (daysOfWeek.length === 7) return "Daily";
    if (daysOfWeek.length === 1) return "Weekly";
    return `Weekly (${daysOfWeek.length}x)`;
  }
  
  if (recurrenceType === "none" || !recurrenceType) {
    return "None";
  }
  
  return "Weekly";
}

// Helper to get status
function getStatus(isActive: boolean | null, isDeleted: boolean | null): string {
  if (isDeleted) return "Deleted";
  return isActive === false ? "Archived" : "Active";
}

interface ExportData {
  visions: any[];
  goals: any[];
  commitments: any[];
  completions: any[];
}

async function fetchExportData(userId: string): Promise<ExportData> {
  const [visionsRes, goalsRes, commitmentsRes, completionsRes] = await Promise.all([
    supabase
      .from("life_visions")
      .select("*")
      .eq("user_id", userId)
      .eq("is_deleted", false),
    supabase
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .eq("is_deleted", false),
    supabase
      .from("weekly_commitments")
      .select("*")
      .eq("user_id", userId)
      .eq("is_deleted", false),
    supabase
      .from("commitment_completions")
      .select("*")
      .eq("user_id", userId)
      .eq("is_deleted", false),
  ]);

  return {
    visions: visionsRes.data || [],
    goals: goalsRes.data || [],
    commitments: commitmentsRes.data || [],
    completions: completionsRes.data || [],
  };
}

// Build lookup maps for hierarchy resolution
function buildLookupMaps(data: ExportData) {
  const visionMap = new Map<string, any>();
  const goalMap = new Map<string, any>();
  const commitmentMap = new Map<string, any>();

  data.visions.forEach((v) => visionMap.set(v.id, v));
  data.goals.forEach((g) => goalMap.set(g.id, g));
  data.commitments.forEach((c) => commitmentMap.set(c.id, c));

  return { visionMap, goalMap, commitmentMap };
}

// Get vision and goal names for a commitment
function resolveHierarchy(
  commitment: any,
  goalMap: Map<string, any>,
  visionMap: Map<string, any>
): { visionName: string; goalName: string; visionId: string; goalId: string } {
  let visionName = "";
  let goalName = "";
  let visionId = "";
  let goalId = "";

  if (commitment.goal_id) {
    const goal = goalMap.get(commitment.goal_id);
    if (goal) {
      goalName = goal.title || "";
      goalId = goal.id || "";

      if (goal.life_vision_id) {
        const vision = visionMap.get(goal.life_vision_id);
        if (vision) {
          visionName = vision.title || "";
          visionId = vision.id || "";
        }
      }
    }
  }

  return { visionName, goalName, visionId, goalId };
}

/**
 * Generate Task Log CSV (execution-focused)
 * One row per task occurrence
 */
function generateTaskLogCSV(data: ExportData): string {
  const { visionMap, goalMap, commitmentMap } = buildLookupMaps(data);

  const headers = [
    "Vision",
    "Goal",
    "Task",
    "Task Nature",
    "Source",
    "Date",
    "Start Time",
    "End Time",
    "Completed",
    "Notes",
    "Vision ID",
    "Goal ID",
    "Task ID",
    "Weekly Commitment ID",
    "Daily Check-in ID",
  ];

  const rows: string[][] = [];

  // Track which commitments have daily instances
  const commitmentsWithInstances = new Set<string>();

  // Process daily completions (commitment_completions)
  data.completions.forEach((completion) => {
    const commitment = completion.commitment_id
      ? commitmentMap.get(completion.commitment_id)
      : null;

    if (completion.commitment_id) {
      commitmentsWithInstances.add(completion.commitment_id);
    }

    // Resolve hierarchy
    let visionName = "";
    let goalName = "";
    let visionId = "";
    let goalId = "";
    let taskName = completion.title || "";
    let taskNature = completion.task_type === "independent" ? "One-off" : "Habit";

    if (commitment) {
      const hierarchy = resolveHierarchy(commitment, goalMap, visionMap);
      visionName = hierarchy.visionName;
      goalName = hierarchy.goalName;
      visionId = hierarchy.visionId;
      goalId = hierarchy.goalId;
      taskName = taskName || commitment.title;
      taskNature = getTaskNature(commitment.commitment_type);
    }

    rows.push([
      escapeCSV(visionName),
      escapeCSV(goalName),
      escapeCSV(taskName),
      escapeCSV(taskNature),
      "daily_instance",
      escapeCSV(completion.completed_date || ""),
      escapeCSV(formatTime(completion.time_start)),
      escapeCSV(formatTime(completion.time_end)),
      completion.is_completed !== false ? "true" : "false",
      "", // Notes - empty by default
      escapeCSV(visionId),
      escapeCSV(goalId),
      escapeCSV(commitment?.id || completion.id),
      escapeCSV(completion.commitment_id || ""),
      escapeCSV(completion.id),
    ]);
  });

  // Add weekly templates that have no daily instances
  data.commitments.forEach((commitment) => {
    if (commitmentsWithInstances.has(commitment.id)) {
      return; // Skip - already has daily instances
    }

    const hierarchy = resolveHierarchy(commitment, goalMap, visionMap);
    const taskNature = getTaskNature(commitment.commitment_type);

    rows.push([
      escapeCSV(hierarchy.visionName),
      escapeCSV(hierarchy.goalName),
      escapeCSV(commitment.title),
      escapeCSV(taskNature),
      "weekly_template",
      "", // Date blank
      escapeCSV(formatTime(commitment.default_time_start)),
      escapeCSV(formatTime(commitment.default_time_end)),
      "false",
      "", // Notes
      escapeCSV(hierarchy.visionId),
      escapeCSV(hierarchy.goalId),
      escapeCSV(commitment.id),
      escapeCSV(commitment.id),
      "", // No daily check-in
    ]);
  });

  // Build CSV string
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  return csvContent;
}

/**
 * Generate Inventory CSV (structure-focused)
 * One row per task (no duplication for recurring)
 */
function generateInventoryCSV(data: ExportData): string {
  const { visionMap, goalMap } = buildLookupMaps(data);

  const headers = [
    "Vision",
    "Goal",
    "Task",
    "Task Nature",
    "Recurrence Pattern",
    "Status",
    "Vision ID",
    "Goal ID",
    "Task ID",
    "Weekly Commitment ID",
  ];

  const rows: string[][] = [];

  // Each commitment appears once
  data.commitments.forEach((commitment) => {
    const hierarchy = resolveHierarchy(commitment, goalMap, visionMap);
    const taskNature = getTaskNature(commitment.commitment_type);
    const recurrencePattern = getRecurrencePattern(commitment);
    const status = getStatus(commitment.is_active, commitment.is_deleted);

    rows.push([
      escapeCSV(hierarchy.visionName),
      escapeCSV(hierarchy.goalName),
      escapeCSV(commitment.title),
      escapeCSV(taskNature),
      escapeCSV(recurrencePattern),
      escapeCSV(status),
      escapeCSV(hierarchy.visionId),
      escapeCSV(hierarchy.goalId),
      escapeCSV(commitment.id),
      escapeCSV(commitment.id),
    ]);
  });

  // Build CSV string
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  return csvContent;
}

/**
 * Export CSV files as a ZIP
 */
export async function exportCSV(userId: string): Promise<Blob> {
  // Fetch all data
  const data = await fetchExportData(userId);

  // Generate both CSVs
  const taskLogCSV = generateTaskLogCSV(data);
  const inventoryCSV = generateInventoryCSV(data);

  // Create ZIP file
  const zip = new JSZip();
  zip.file("todayoum_task_log.csv", taskLogCSV);
  zip.file("todayoum_inventory.csv", inventoryCSV);

  // Generate ZIP blob
  const blob = await zip.generateAsync({ type: "blob" });
  return blob;
}
