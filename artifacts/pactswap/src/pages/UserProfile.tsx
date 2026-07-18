import { useRoute } from "wouter";
import { useGetUserProfile, getGetUserProfileQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Star, ShieldCheck, Calendar, Activity } from "lucide-react";
import { format } from "date-fns";

export default function UserProfile() {
  const [, params] = useRoute("/users/:walletAddress");
  const walletAddress = params?.walletAddress || "";

  const { data: profile, isLoading } = useGetUserProfile(walletAddress, {
    query: {
      enabled: !!walletAddress,
      queryKey: getGetUserProfileQueryKey(walletAddress),
    }
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-20 text-center text-white">
        <h2 className="text-2xl font-bold mb-2">User Not Found</h2>
        <p className="text-muted-foreground">The trader you are looking for does not exist.</p>
      </div>
    );
  }

  const kycBadge = (level: number) => {
    switch(level) {
      case 3: return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20"><ShieldCheck className="w-3 h-3 mr-1"/> Fully Verified</Badge>;
      case 2: return <Badge variant="outline" className="bg-slate-300/10 text-slate-300 border-slate-300/20"><ShieldCheck className="w-3 h-3 mr-1"/> Verified</Badge>;
      case 1: return <Badge variant="outline" className="bg-amber-700/10 text-amber-700 border-amber-700/20"><ShieldCheck className="w-3 h-3 mr-1"/> Basic</Badge>;
      default: return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Unverified</Badge>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <Card className="bg-card border-border shadow-xl overflow-hidden relative">
        <div className="h-32 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background border-b border-border/50"></div>
        <CardContent className="pt-0 relative">
          <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-end -mt-16 sm:-mt-12 mb-8 px-4">
            <div className="w-32 h-32 rounded-full border-4 border-card bg-background flex items-center justify-center text-5xl font-bold text-primary shadow-lg z-10">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl font-bold text-white mb-1 flex items-center justify-center sm:justify-start gap-3">
                {profile.name}
                {kycBadge(profile.kycLevel)}
              </h1>
              <p className="text-muted-foreground font-mono text-sm">{profile.walletAddress}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/20 rounded-xl p-6 border border-border/50">
            <div className="flex flex-col items-center sm:items-start">
              <div className="flex items-center text-muted-foreground text-sm mb-1">
                <Star className="w-4 h-4 text-primary mr-2" /> Rating
              </div>
              <div className="text-2xl font-bold text-white">{profile.rating.toFixed(1)} / 5.0</div>
            </div>
            
            <div className="flex flex-col items-center sm:items-start">
              <div className="flex items-center text-muted-foreground text-sm mb-1">
                <Activity className="w-4 h-4 text-blue-500 mr-2" /> Trades
              </div>
              <div className="text-2xl font-bold text-white">{profile.tradeCount}</div>
            </div>

            <div className="flex flex-col items-center sm:items-start md:col-span-2">
              <div className="flex items-center text-muted-foreground text-sm mb-1">
                <Calendar className="w-4 h-4 mr-2" /> Member Since
              </div>
              <div className="text-lg font-medium text-white">{format(new Date(profile.createdAt), "MMMM yyyy")}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}