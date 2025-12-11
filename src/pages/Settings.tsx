import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
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
import { Loader2, Download } from "lucide-react";

/**
 * Settings page - MVP version
 * Allows users to customize preferences like start of week, time/date format
 */
const Settings = () => {
  const { user } = useAuth();
  const { refetch: refetchPreferences } = useUserPreferences();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

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
      // Refetch preferences to update the app
      await refetchPreferences();
      toast({
        title: "Saved",
        description: "Your settings have been updated.",
      });
    }
  };

  // Export user data as JSON
  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);

    try {
      // Fetch all user data
      const [visionsRes, goalsRes, commitmentsRes, completionsRes, pillarsRes] = await Promise.all([
        supabase.from("life_visions").select("*").eq("user_id", user.id),
        supabase.from("goals").select("*").eq("user_id", user.id),
        supabase.from("weekly_commitments").select("*").eq("user_id", user.id),
        supabase.from("commitment_completions").select("*").eq("user_id", user.id),
        supabase.from("pillars").select("*").eq("user_id", user.id),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        pillars: pillarsRes.data || [],
        visions: visionsRes.data || [],
        goals: goalsRes.data || [],
        weeklyCommitments: commitmentsRes.data || [],
        taskCompletions: completionsRes.data || [],
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `todayoum-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export complete",
        description: "Your data has been downloaded as a JSON file.",
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export failed",
        description: "Failed to export your data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
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
              <SelectItem value="12h">12-hour (2:30 PM)</SelectItem>
              <SelectItem value="24h">24-hour (14:30)</SelectItem>
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
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (15/01/2024)</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (01/15/2024)</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2024-01-15)</SelectItem>
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
            Export all your pillars, visions, goals, and tasks as a JSON file.
          </p>
          <Button variant="outline" onClick={handleExportData} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export my data
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
