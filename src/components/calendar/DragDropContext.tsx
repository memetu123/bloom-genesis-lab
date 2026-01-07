import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { TimeGridTask } from "./TimeGrid";

/**
 * Context for managing drag-and-drop state in the calendar
 */

interface DragState {
  task: TimeGridTask | null;
  sourceDate: Date | null;
  sourceDateKey: string | null;
  isDragging: boolean;
}

interface DragDropContextValue {
  dragState: DragState;
  startDrag: (task: TimeGridTask, date: Date, dateKey: string) => void;
  endDrag: () => void;
  // For tracking drop target
  dropTarget: { dateKey: string; timeMinutes: number | null } | null;
  setDropTarget: (target: { dateKey: string; timeMinutes: number | null } | null) => void;
}

const DragDropContext = createContext<DragDropContextValue | null>(null);

export function DragDropProvider({ children }: { children: ReactNode }) {
  const [dragState, setDragState] = useState<DragState>({
    task: null,
    sourceDate: null,
    sourceDateKey: null,
    isDragging: false,
  });
  
  const [dropTarget, setDropTarget] = useState<{ dateKey: string; timeMinutes: number | null } | null>(null);

  const startDrag = useCallback((task: TimeGridTask, date: Date, dateKey: string) => {
    setDragState({
      task,
      sourceDate: date,
      sourceDateKey: dateKey,
      isDragging: true,
    });
  }, []);

  const endDrag = useCallback(() => {
    setDragState({
      task: null,
      sourceDate: null,
      sourceDateKey: null,
      isDragging: false,
    });
    setDropTarget(null);
  }, []);

  return (
    <DragDropContext.Provider value={{ dragState, startDrag, endDrag, dropTarget, setDropTarget }}>
      {children}
    </DragDropContext.Provider>
  );
}

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error("useDragDrop must be used within a DragDropProvider");
  }
  return context;
}
