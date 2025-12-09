/**
 * Types for task scheduling system
 * 
 * Recurrence Model:
 * - 'none': One-time task (independent)
 * - 'daily': Repeats every day, optionally multiple times per day
 * - 'weekly': Repeats on specific days of the week
 */

export type RecurrenceType = 'none' | 'daily' | 'weekly';
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

// Legacy types kept for backward compatibility
export type TaskType = 'recurring' | 'independent';
export type RepeatFrequency = 'daily' | 'weekly' | 'custom';

export interface RecurrenceRules {
  recurrenceType: RecurrenceType;
  timesPerDay?: number;      // Only for 'daily' recurrence
  daysOfWeek?: DayOfWeek[];  // Only for 'weekly' recurrence
}

// Legacy interface - keep for backward compatibility
export interface RepetitionRules {
  frequency: RepeatFrequency;
  timesPerPeriod: number;
  daysOfWeek: DayOfWeek[];
}

export interface TaskFormData {
  title: string;
  taskType: TaskType;
  recurrence?: RecurrenceRules;
  repetition?: RepetitionRules;
  goalId?: string | null;
  timeStart?: string;
  timeEnd?: string;
  scheduledDate?: string; // For independent tasks
}

export interface ScheduledTask {
  id: string;
  commitmentId: string | null;
  title: string;
  taskType: TaskType;
  isCompleted: boolean;
  timeStart: string | null;
  timeEnd: string | null;
  instanceNumber?: number;
  totalInstances?: number;
  goalIsFocus?: boolean | null;
  isDetached?: boolean;
  recurrenceType?: RecurrenceType;
}
