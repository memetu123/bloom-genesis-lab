import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Profile page - MVP version
 * Allows users to view/edit their name and see their email
 */
const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Fetch user preferences on mount, fallback to profiles table for signup name
  useEffect(() => {
    const fetchDisplayName = async () => {
      if (!user) return;

      // First try user_preferences
      const { data: prefData, error: prefError } = await supabase
        .from("user_preferences")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (prefError && prefError.code !== "PGRST116") {
        console.error("Error fetching preferences:", prefError);
      }

      if (prefData?.display_name) {
        setDisplayName(prefData.display_name);
        setLoading(false);
        return;
      }

      // Fallback to profiles table (set during signup via trigger)
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError && profileError.code !== "PGRST116") {
        console.error("Error fetching profile:", profileError);
      }

      if (profileData?.display_name) {
        setDisplayName(profileData.display_name);
      }
      setLoading(false);
    };

    fetchDisplayName();
  }, [user]);

  // Save display name
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, display_name: displayName },
        { onConflict: "user_id" }
      );

    setSaving(false);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to save your name. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Saved",
        description: "Your profile has been updated.",
      });
    }
  };

  // Send password reset email
  const handleChangePassword = async () => {
    if (!user?.email) return;
    setResettingPassword(true);

    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth`,
    });

    setResettingPassword(false);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to send password reset email. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email sent",
        description: "Check your inbox for a password reset link.",
      });
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
      <h1 className="text-2xl font-semibold text-foreground mb-2">Profile</h1>
      <p className="text-muted-foreground mb-8">
        Manage your personal account information.
      </p>

      <div className="space-y-6">
        {/* Display Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
          />
        </div>

        {/* Email (read-only) */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={user?.email || ""}
            disabled
            className="bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            Email cannot be changed here.
          </p>
        </div>

        {/* Save Button */}
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save changes
        </Button>

        {/* Change Password */}
        <div className="pt-6 border-t border-border">
          <h2 className="text-lg font-medium text-foreground mb-2">Password</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Change your password by requesting a reset link.
          </p>
          <Button
            variant="outline"
            onClick={handleChangePassword}
            disabled={resettingPassword}
          >
            {resettingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Change password
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
