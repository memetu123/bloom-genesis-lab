/**
 * Types for task scheduling system
 */

export type TaskType = 'recurring' | 'independent';
export type RepeatFrequency = 'daily' | 'weekly' | 'custom';
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface RepetitionRules {
  frequency: RepeatFrequency;
  timesPerPeriod: number;
  daysOfWeek: DayOfWeek[];
}

export interface TaskFormData {
  title: string;
  taskType: TaskType;
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
}
