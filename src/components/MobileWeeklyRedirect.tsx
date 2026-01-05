import { Navigate, useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import Weekly from "@/pages/Weekly";
import AppLayout from "@/components/AppLayout";

/**
 * MobileWeeklyRedirect - Redirects /weekly to /daily on mobile
 * Desktop/tablet users see the full Weekly view
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
  return (
    <AppLayout>
      <Weekly />
    </AppLayout>
  );
};

export default MobileWeeklyRedirect;
