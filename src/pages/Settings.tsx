import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Settings page - MVP version
 * Allows users to customize preferences like start of week, time/date format
 */
const Settings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Preferences state
  const [startOfWeek, setStartOfWeek] = useState("monday");
  const [timeFormat, setTimeFormat] = useState("24h");
  const [dateFormat, setDateFormat] = useState("YYYY-MM-DD");

  // Fetch user preferences on mount
  useEffect(() => {
    const fetchPreferences = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("user_preferences")
        .select("start_of_week, time_format, date_format")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching preferences:", error);
      }

      if (data) {
        setStartOfWeek(data.start_of_week || "monday");
        setTimeFormat(data.time_format || "24h");
        setDateFormat(data.date_format || "YYYY-MM-DD");
      }
      setLoading(false);
    };

    fetchPreferences();
  }, [user]);

  // Save preferences
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: user.id,
          start_of_week: startOfWeek,
          time_format: timeFormat,
          date_format: dateFormat,
        },
        { onConflict: "user_id" }
      );

    setSaving(false);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Saved",
        description: "Your settings have been updated.",
      });
    }
  };

  // Export data placeholder
  const handleExportData = () => {
    toast({
      title: "Coming soon",
      description: "Data export feature is under development.",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold text-foreground mb-2">Settings</h1>
      <p className="text-muted-foreground mb-8">
        Customize your Todayoum experience.
      </p>

      <div className="space-y-6">
        {/* Start of Week */}
        <div className="space-y-2">
          <Label htmlFor="start-of-week">Start of week</Label>
          <Select value={startOfWeek} onValueChange={setStartOfWeek}>
            <SelectTrigger id="start-of-week">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sunday">Sunday</SelectItem>
              <SelectItem value="monday">Monday</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Time Format */}
        <div className="space-y-2">
          <Label htmlFor="time-format">Time format</Label>
          <Select value={timeFormat} onValueChange={setTimeFormat}>
            <SelectTrigger id="time-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12h">12-hour</SelectItem>
              <SelectItem value="24h">24-hour</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Format */}
        <div className="space-y-2">
          <Label htmlFor="date-format">Date format</Label>
          <Select value={dateFormat} onValueChange={setDateFormat}>
            <SelectTrigger id="date-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Save Button */}
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save settings
        </Button>

        {/* Export Data */}
        <div className="pt-6 border-t border-border">
          <h2 className="text-lg font-medium text-foreground mb-2">Your data</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Export all your goals, visions, and tasks.
          </p>
          <Button variant="outline" onClick={handleExportData}>
            Export my data
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
