import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { UserPreferencesProvider } from "@/hooks/useUserPreferences";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Visions from "./pages/Visions";
import VisionDetail from "./pages/VisionDetail";
import Goals from "./pages/Goals";
import GoalDetail from "./pages/GoalDetail";
import Weekly from "./pages/Weekly";
import Daily from "./pages/Daily";
import RecentlyDeleted from "./pages/RecentlyDeleted";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/**
 * App - Root component with routing
 * Provides auth, query, tooltip, and user preferences contexts
 */
const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <UserPreferencesProvider>
              <Routes>
              {/* Public routes */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/onboarding" element={<Onboarding />} />
              
              {/* Main app routes with layout */}
              <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
              <Route path="/visions" element={<AppLayout><Visions /></AppLayout>} />
              <Route path="/vision/:id" element={<AppLayout><VisionDetail /></AppLayout>} />
              <Route path="/goals" element={<AppLayout><Goals /></AppLayout>} />
              <Route path="/goal/:id" element={<AppLayout><GoalDetail /></AppLayout>} />
              <Route path="/weekly" element={<AppLayout><Weekly /></AppLayout>} />
              <Route path="/daily" element={<AppLayout><Daily /></AppLayout>} />
              <Route path="/recently-deleted" element={<AppLayout><RecentlyDeleted /></AppLayout>} />
              <Route path="/profile" element={<AppLayout><Profile /></AppLayout>} />
              <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
              
                <Route path="*" element={<NotFound />} />
              </Routes>
            </UserPreferencesProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;