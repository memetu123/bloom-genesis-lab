import { ReactNode, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CalendarDays, User, Settings, Trash2, LogOut, Compass, ChevronDown } from "lucide-react";
import NorthStarIcon from "@/components/icons/NorthStarIcon";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import GlobalSearch from "@/components/GlobalSearch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * AppLayout - Shared layout with top navigation
 * Provides consistent navigation across all main pages
 * 
 * Navigation structure:
 * - North Star (persistent)
 * - Calendar view selector (Weekly/Daily/Schedule dropdown)
 * 
 * Mobile: Icon-only nav with North Star and Today
 * Desktop/Tablet: Full navigation with view selector dropdown
 */

interface AppLayoutProps {
  children: ReactNode;
}

// View labels for the calendar dropdown
const VIEW_LABELS = {
  weekly: "Weekly",
  daily: "Daily",
  schedule: "Schedule",
} as const;

type CalendarViewType = keyof typeof VIEW_LABELS;

// Mobile navigation items - icon-only with accessibility labels
const mobileNavItems = [
  { label: "North Star", path: "/dashboard", icon: NorthStarIcon, ariaLabel: "North Star - orientation and goals" },
  { label: "Today", path: "/daily", icon: CalendarDays, ariaLabel: "Today - daily tasks and execution" },
];

const AppLayout = ({ children }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user?.email) return "U";
    const email = user.email;
    return email.charAt(0).toUpperCase();
  };

  // Determine current calendar view from path
  const currentCalendarView = useMemo((): CalendarViewType => {
    if (location.pathname.startsWith("/weekly")) return "weekly";
    if (location.pathname.startsWith("/daily")) return "daily";
    return "daily"; // default
  }, [location.pathname]);

  // Check if currently on a calendar view
  const isOnCalendarView = location.pathname.startsWith("/weekly") || location.pathname.startsWith("/daily");

  // Navigate to a specific calendar view, preserving date param
  const navigateToCalendarView = (view: CalendarViewType) => {
    const searchParams = new URLSearchParams(location.search);
    const dateParam = searchParams.get("date");
    const queryString = dateParam ? `?date=${dateParam}` : "";
    
    switch (view) {
      case "weekly":
        navigate(`/weekly${queryString}`);
        break;
      case "daily":
        navigate(`/daily${queryString}`);
        break;
      case "schedule":
        // Placeholder - not implemented yet
        break;
    }
  };

  // Check if path is active - mobile-only: /weekly also counts as active for "Today"
  const isActive = (path: string) => {
    if (isMobile && path === "/daily" && location.pathname === "/weekly") {
      return true; // Weekly redirects to daily on mobile
    }
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-border sticky top-0 bg-background z-50 shrink-0">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <button 
              onClick={() => navigate("/dashboard")}
              className="text-xl font-semibold text-foreground hover:text-primary transition-calm"
            >
              Todayoum
            </button>

            {/* Desktop/Tablet Navigation Links */}
            <nav className="hidden sm:flex items-center gap-1">
              {/* North Star - persistent nav item */}
              <button
                onClick={() => navigate("/dashboard")}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-calm mr-2",
                  location.pathname === "/dashboard"
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <NorthStarIcon className="h-5 w-5" />
                North Star
              </button>
              
              {/* Calendar View Selector Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-calm",
                      isOnCalendarView
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <CalendarDays className="h-4 w-4" />
                    {VIEW_LABELS[currentCalendarView]}
                    <ChevronDown className="h-3.5 w-3.5 ml-0.5 text-muted-foreground/60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40 bg-popover border border-border shadow-md">
                  <DropdownMenuItem
                    onClick={() => navigateToCalendarView("daily")}
                    className={cn(
                      "cursor-pointer",
                      currentCalendarView === "daily" && "bg-accent"
                    )}
                  >
                    Daily
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigateToCalendarView("weekly")}
                    className={cn(
                      "cursor-pointer",
                      currentCalendarView === "weekly" && "bg-accent"
                    )}
                  >
                    Weekly
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled
                    className="cursor-not-allowed opacity-50"
                  >
                    Schedule (coming soon)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>

            {/* Global Search and User Menu */}
            <div className="flex items-center gap-3">
              <GlobalSearch />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-calm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {getUserInitials()}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-popover border border-border shadow-md">
                  <DropdownMenuItem onClick={() => navigate("/onboarding?guide=true")} className="cursor-pointer">
                    <Compass className="h-4 w-4 mr-2" />
                    Planning Guide
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/recently-deleted")} className="cursor-pointer">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Deleted items
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Mobile Navigation - Icon-only mode switching */}
          <nav className="sm:hidden flex items-center justify-center gap-6 pb-1.5 -mt-1">
            {mobileNavItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-label={item.ariaLabel}
                title={item.label}
                className={cn(
                  "relative p-2 transition-calm",
                  isActive(item.path)
                    ? "text-primary"
                    : "text-muted-foreground/60 hover:text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {/* Active indicator - subtle underline */}
                {isActive(item.path) && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Page Content - flex-1 for calendar views to fill height */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
};

export default AppLayout;