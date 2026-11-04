import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const { sbUser, sbLoading } = useSupabaseAuth();
  const [location, setLocation] = useLocation();

  const loading = isLoading || sbLoading;
  const loggedIn = !!token || !!sbUser;

  useEffect(() => {
    if (!loading && !loggedIn) {
      setLocation(`/login?next=${encodeURIComponent(location)}`);
    }
  }, [loading, loggedIn, location, setLocation]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!loggedIn) return null;

  return <>{children}</>;
}
