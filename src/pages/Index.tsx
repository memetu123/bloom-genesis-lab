import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Index Page - Entry point
 * Redirects based on auth state and onboarding completion
 */
const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkOnboarding = async () => {
      if (authLoading) return;

      if (!user) {
        setChecking(false);
        return;
      }

      // Check if user has completed onboarding
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.onboarding_completed) {
        navigate("/dashboard");
      } else {
        navigate("/onboarding");
      }
    };

    checkOnboarding();
  }, [user, authLoading, navigate]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Show landing for non-authenticated users
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16 animate-fade-in">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Todayoum
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Connect your long-term life visions to short-term weekly habits.
            Plan intentionally. Live purposefully.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Button onClick={() => navigate("/auth")}>Get Started</Button>
            <Button variant="outline" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;