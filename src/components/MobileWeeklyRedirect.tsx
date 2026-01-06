import { Navigate, useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import Weekly from "@/pages/Weekly";

/**
 * MobileWeeklyRedirect - Redirects /weekly to /daily on mobile
 * Desktop/tablet users see the full Weekly view
 * Note: AppLayout is handled at the route level in App.tsx
 */
const MobileWeeklyRedirect = () => {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  
  // On mobile, redirect to /daily (Today view)
  if (isMobile) {
    // Preserve any date param if present
    const dateParam = searchParams.get("date");
    const redirectPath = dateParam ? `/daily?date=${dateParam}` : "/daily";
    return <Navigate to={redirectPath} replace />;
  }
  
  // Desktop/tablet: show normal Weekly view
  // AppLayout is wrapped at the route level
  return <Weekly />;
};

export default MobileWeeklyRedirect;
