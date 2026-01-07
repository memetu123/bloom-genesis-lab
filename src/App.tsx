import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppDataProvider } from "@/hooks/useAppData";
import { TimeDisplayProvider } from "@/components/calendar/TimeDisplayContext";
import { CalendarViewProvider } from "@/components/calendar/CalendarViewContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppLayout from "@/components/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import MobileWeeklyRedirect from "@/components/MobileWeeklyRedirect";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import VisionDetail from "./pages/VisionDetail";
import Goals from "./pages/Goals";
import GoalDetail from "./pages/GoalDetail";
import Daily from "./pages/Daily";
import Schedule from "./pages/Schedule";
import RecentlyDeleted from "./pages/RecentlyDeleted";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/**
 * App - Root component with routing
 * AppDataProvider caches core entities (preferences, pillars, visions, goals) once per session
 */
const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppDataProvider>
              <TimeDisplayProvider>
                <CalendarViewProvider>
                  <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/onboarding" element={<Onboarding />} />
                  
                  {/* Protected app routes with layout */}
                  <Route path="/dashboard" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
                  <Route path="/visions" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/vision/:id" element={<ProtectedRoute><AppLayout><VisionDetail /></AppLayout></ProtectedRoute>} />
                  <Route path="/goals" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/goal/:id" element={<ProtectedRoute><AppLayout><GoalDetail /></AppLayout></ProtectedRoute>} />
                  <Route path="/weekly" element={<ProtectedRoute><AppLayout><MobileWeeklyRedirect /></AppLayout></ProtectedRoute>} />
                  <Route path="/daily" element={<ProtectedRoute><AppLayout><Daily /></AppLayout></ProtectedRoute>} />
                  <Route path="/schedule" element={<ProtectedRoute><AppLayout><Schedule /></AppLayout></ProtectedRoute>} />
                  <Route path="/recently-deleted" element={<ProtectedRoute><AppLayout><RecentlyDeleted /></AppLayout></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
                  
                  <Route path="*" element={<NotFound />} />
                  </Routes>
                </CalendarViewProvider>
              </TimeDisplayProvider>
            </AppDataProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;