import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, CalendarDays, User, Settings, Trash2, LogOut, Compass } from "lucide-react";
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
 * Mobile: 2 pages only - North Star and Today (combined Weekly/Daily)
 * Desktop/Tablet: Full navigation with Weekly and Daily separate
 */

interface AppLayoutProps {
  children: ReactNode;
}

// Desktop/tablet navigation items
const desktopNavItems = [
  { label: "North Star", path: "/dashboard", icon: NorthStarIcon },
  { label: "Weekly", path: "/weekly", icon: Calendar },
  { label: "Daily", path: "/daily", icon: CalendarDays },
];

// Mobile navigation items - only 2 pages
const mobileNavItems = [
  { label: "North Star", path: "/dashboard", icon: NorthStarIcon },
  { label: "Today", path: "/daily", icon: CalendarDays },
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

  // Check if path is active - for mobile, /weekly also counts as active for "Today"
  const isActive = (path: string) => {
    if (path === "/daily" && location.pathname === "/weekly") {
      return true; // Weekly redirects to daily on mobile
    }
    return location.pathname === path;
  };

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

            {/* Desktop/Tablet Navigation Links */}
            <nav className="hidden sm:flex items-center gap-1">
              {desktopNavItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-calm",
                    isActive(item.path)
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    item.path === "/dashboard" && "mr-2"
                  )}
                >
                  <item.icon className={item.path === "/dashboard" ? "h-5 w-5" : "h-4 w-4"} />
                  {item.label}
                </button>
              ))}
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

          {/* Mobile Navigation - Only 2 items */}
          <nav className="sm:hidden flex items-center justify-center gap-4 pb-2 -mt-1">
            {mobileNavItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-md text-xs font-medium transition-calm min-w-[60px]",
                  isActive(item.path)
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className={item.path === "/dashboard" ? "h-5 w-5" : "h-4 w-4"} />
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