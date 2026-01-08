import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CalendarDays, User, Settings, Trash2, Archive, LogOut, Compass } from "lucide-react";
import NorthStarIcon from "@/components/icons/NorthStarIcon";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import GlobalSearch from "@/components/GlobalSearch";
import CalendarViewSelector from "@/components/calendar/CalendarViewSelector";
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


  // Check if path is active - mobile-only: /weekly also counts as active for "Today"
  const isActive = (path: string) => {
    if (isMobile && path === "/daily" && location.pathname === "/weekly") {
      return true; // Weekly redirects to daily on mobile
    }
    return location.pathname === path;
  };

  return (
    <div className="h-screen bg-background flex flex-col">
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
              
              {/* Calendar View Selector - Split Button */}
              <CalendarViewSelector />
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/archived")} className="cursor-pointer">
                    <Archive className="h-4 w-4 mr-2" />
                    Archived
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/deleted")} className="cursor-pointer">
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
      <main className="flex-1 overflow-auto min-h-0">{children}</main>
    </div>
  );
};

export default AppLayout;