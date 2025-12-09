import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * EditableTitle Component
 * Allows inline editing of a title with save/cancel actions
 */

interface EditableTitleProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
}

const EditableTitle = ({ value, onSave, className = "" }: EditableTitleProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = async () => {
    if (!editValue.trim() || editValue.trim() === value) {
      setEditValue(value);
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(editValue.trim());
      setIsEditing(false);
    } catch (error) {
      setEditValue(value);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className="text-2xl font-semibold h-auto py-1"
        />
        <button
          onClick={handleSave}
          disabled={saving || !editValue.trim()}
          className="p-1 rounded hover:bg-muted transition-calm disabled:opacity-50"
          title="Save"
        >
          <Check className="h-5 w-5 text-primary" />
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="p-1 rounded hover:bg-muted transition-calm disabled:opacity-50"
          title="Cancel"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h1 className={`text-2xl font-semibold text-foreground ${className}`}>{value}</h1>
      <button
        onClick={() => setIsEditing(true)}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-calm"
        title="Rename"
      >
        <Pencil className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
};

export default EditableTitle;
