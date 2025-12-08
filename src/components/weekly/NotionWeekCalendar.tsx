import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { useNavigate } from "react-router-dom";

/**
 * NotionWeekCalendar - Notion-style 7-day calendar grid
 * Shows tasks inside each day cell
 */

interface DayTask {
  id: string;
  commitmentId: string;
  title: string;
  isCompleted: boolean;
}

interface WeekDay {
  date: Date;
  tasks: DayTask[];
}

interface NotionWeekCalendarProps {
  weekStart: Date;
  tasksByDate: Record<string, DayTask[]>;
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onTaskClick: (task: DayTask, date: Date) => void;
}

const NotionWeekCalendar = ({
  weekStart,
  tasksByDate,
  selectedDate,
  onDateSelect,
  onTaskClick,
}: NotionWeekCalendarProps) => {
  const navigate = useNavigate();

  // Generate 7 days starting from weekStart
  const weekDays: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateKey = format(date, "yyyy-MM-dd");
    return {
      date,
      tasks: tasksByDate[dateKey] || [],
    };
  });

  const handleDayClick = (date: Date) => {
    navigate(`/daily?date=${format(date, "yyyy-MM-dd")}`);
  };

  const handleTaskClick = (e: React.MouseEvent, task: DayTask, date: Date) => {
    e.stopPropagation();
    onTaskClick(task, date);
  };

  const isToday = (date: Date) => isSameDay(date, new Date());
  const isSelected = (date: Date) => isSameDay(date, selectedDate);

  return (
    <div className="border border-border">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {weekDays.map(({ date }) => (
          <div
            key={format(date, "yyyy-MM-dd")}
            className="px-2 py-2 text-center border-r border-border last:border-r-0"
          >
            <span className="text-xs font-medium text-muted-foreground uppercase">
              {format(date, "EEE")}
            </span>
          </div>
        ))}
      </div>

      {/* Day cells with tasks */}
      <div className="grid grid-cols-7 min-h-[200px]">
        {weekDays.map(({ date, tasks }) => {
          const dateKey = format(date, "yyyy-MM-dd");
          const dayIsToday = isToday(date);
          const dayIsSelected = isSelected(date);

          return (
            <div
              key={dateKey}
              onClick={() => handleDayClick(date)}
              className={`
                border-r border-border last:border-r-0 p-2 cursor-pointer
                hover:bg-muted/30 transition-calm
                ${dayIsSelected ? "bg-accent/30" : ""}
              `}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`
                    text-sm font-medium
                    ${dayIsToday ? "text-primary" : "text-foreground"}
                  `}
                >
                  {format(date, "d")}
                </span>
                {dayIsToday && (
                  <span className="text-[10px] text-primary font-medium">
                    TODAY
                  </span>
                )}
              </div>

              {/* Tasks */}
              <div className="space-y-1">
                {tasks.slice(0, 5).map((task) => (
                  <button
                    key={task.id}
                    onClick={(e) => handleTaskClick(e, task, date)}
                    className={`
                      w-full text-left text-xs py-0.5 px-1 
                      hover:bg-muted transition-calm truncate
                      flex items-center gap-1
                      ${task.isCompleted ? "text-muted-foreground" : "text-foreground"}
                    `}
                  >
                    <span className="flex-shrink-0">
                      {task.isCompleted ? "●" : "○"}
                    </span>
                    <span className={task.isCompleted ? "line-through" : ""}>
                      {task.title}
                    </span>
                  </button>
                ))}
                {tasks.length > 5 && (
                  <span className="text-[10px] text-muted-foreground pl-1">
                    +{tasks.length - 5} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotionWeekCalendar;
