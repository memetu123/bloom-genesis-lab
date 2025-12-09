import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LogOut, LayoutDashboard, Eye, Target, Calendar, CalendarDays, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import GlobalSearch from "@/components/GlobalSearch";

/**
 * AppLayout - Shared layout with top navigation
 * Provides consistent navigation across all main pages
 */

interface AppLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Visions", path: "/visions", icon: Eye },
  { label: "Goals", path: "/goals", icon: Target },
  { label: "Weekly", path: "/weekly", icon: Calendar },
  { label: "Daily", path: "/daily", icon: CalendarDays },
  { label: "Deleted", path: "/recently-deleted", icon: Trash2 },
];

const AppLayout = ({ children }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="border-b border-border sticky top-0 bg-background z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <button 
              onClick={() => navigate("/dashboard")}
              className="text-xl font-semibold text-foreground hover:text-primary transition-calm"
            >
              Todayoum
            </button>

            {/* Navigation Links */}
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-calm",
                    isActive(item.path)
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Global Search and Sign Out */}
            <div className="flex items-center gap-2">
              <GlobalSearch />
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          <nav className="sm:hidden flex items-center justify-center gap-1 pb-2 -mt-1">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-xs font-medium transition-calm",
                  isActive(item.path)
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Page Content */}
      <main>{children}</main>
    </div>
  );
};

export default AppLayout;