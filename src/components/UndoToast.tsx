import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";

/**
 * Undo Toast Component
 * Shows a floating toast with undo button when an item is deleted
 */

interface UndoToastProps {
  itemName: string;
  onUndo: () => void;
  onClose: () => void;
  duration?: number;
}

const UndoToast = ({ itemName, onUndo, onClose, duration = 5000 }: UndoToastProps) => {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      
      if (remaining <= 0) {
        setVisible(false);
        onClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
      <div className="bg-foreground text-background rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 min-w-[280px]">
        <div className="flex-1">
          <p className="text-sm font-medium">"{itemName}" deleted</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onUndo();
            setVisible(false);
          }}
          className="text-background hover:text-background hover:bg-background/10 gap-1.5"
        >
          <Undo2 className="h-4 w-4" />
          Undo
        </Button>
      </div>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-background/20 rounded-b-lg overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default UndoToast;
