import { useState } from "react";
import { Link } from "wouter";
import { useGetKycStatus, useSubmitKyc } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ShieldAlert, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";

export default function KYC() {
  const { data: kycData, isLoading, refetch } = useGetKycStatus();
  const submitKycMutation = useSubmitKyc();

  const [idType, setIdType] = useState<"bvn" | "nin" | "passport" | "drivers_license">("bvn");
  const [idNumber, setIdNumber] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");

  if (isLoading) {
    return (
      <div className="flex-1 flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const kycLevel = kycData?.kycLevel || 0;
  const submissionStatus = kycData?.kycStatus || "pending";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idNumber) {
      toast.error("Please provide your ID number.");
      return;
    }
    
    if (kycLevel === 2 && !selfieUrl) {
      toast.error("Selfie URL is required for Level 3.");
      return;
    }

    submitKycMutation.mutate({
      data: { idType, idNumber, selfieUrl: selfieUrl || null }
    }, {
      onSuccess: () => {
        toast.success("KYC data submitted successfully. Pending admin review.");
        refetch();
      },
      onError: (error) => {
        toast.error((error as any).error || "Failed to submit KYC.");
      }
    });
  };

  const isPending = submissionStatus === "pending" && kycData?.submission;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Identity Verification</h1>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
          To ensure a safe trading environment and prevent fraud, PACTSWAP requires identity verification. Higher tiers unlock higher trading limits.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Tier 1 */}
        <Card className={`bg-card border-2 ${kycLevel >= 1 ? 'border-primary shadow-[0_0_15px_rgba(245,194,66,0.1)]' : 'border-border'} relative overflow-hidden`}>
          {kycLevel >= 1 && <div className="absolute top-0 right-0 w-16 h-16 bg-primary/20 rounded-bl-[100px] flex items-start justify-end p-2"><CheckCircle2 className="w-5 h-5 text-primary" /></div>}
          <CardHeader>
            <CardTitle className="text-lg text-white">Tier 1: Basic</CardTitle>
            <CardDescription>Email Verified</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Max Trade: $100</p>
            <p>• Lifetime Limit: $500</p>
          </CardContent>
        </Card>

        {/* Tier 2 */}
        <Card className={`bg-card border-2 ${kycLevel >= 2 ? 'border-primary shadow-[0_0_15px_rgba(245,194,66,0.1)]' : 'border-border'} relative overflow-hidden`}>
          {kycLevel >= 2 && <div className="absolute top-0 right-0 w-16 h-16 bg-primary/20 rounded-bl-[100px] flex items-start justify-end p-2"><CheckCircle2 className="w-5 h-5 text-primary" /></div>}
          <CardHeader>
            <CardTitle className="text-lg text-white">Tier 2: Verified</CardTitle>
            <CardDescription>BVN / NIN</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Max Trade: $5,000</p>
            <p>• Create Offers: Enabled</p>
          </CardContent>
        </Card>

        {/* Tier 3 */}
        <Card className={`bg-card border-2 ${kycLevel >= 3 ? 'border-primary shadow-[0_0_15px_rgba(245,194,66,0.1)]' : 'border-border'} relative overflow-hidden`}>
          {kycLevel >= 3 && <div className="absolute top-0 right-0 w-16 h-16 bg-primary/20 rounded-bl-[100px] flex items-start justify-end p-2"><CheckCircle2 className="w-5 h-5 text-primary" /></div>}
          <CardHeader>
            <CardTitle className="text-lg text-white">Tier 3: Power User</CardTitle>
            <CardDescription>ID + Selfie</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Max Trade: Unlimited</p>
            <p>• Priority Support</p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border border-border shadow-lg rounded-xl overflow-hidden max-w-2xl mx-auto">
        <div className="p-6 border-b border-border/50 bg-muted/10">
          <h2 className="text-xl font-bold text-white">Upgrade Your Status</h2>
        </div>
        
        <div className="p-6">
          {kycLevel === 3 ? (
            <div className="text-center py-8">
              <ShieldCheck className="w-16 h-16 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Maximum Tier Reached</h3>
              <p className="text-muted-foreground mb-6">You are fully verified and have access to all PACTSWAP features with no limits.</p>
              <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold">
                <Link href="/marketplace">Go to Marketplace</Link>
              </Button>
            </div>
          ) : isPending ? (
            <div className="text-center py-8">
              <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Review in Progress</h3>
              <p className="text-muted-foreground mb-6">Your submitted documents are currently being reviewed by our compliance team. This usually takes 1-2 hours.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
                <p className="text-sm text-primary">
                  Currently applying for: <strong className="font-bold text-white">Tier {kycLevel + 1}</strong>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="idType">Document Type</Label>
                <Select value={idType} onValueChange={(val: any) => setIdType(val)}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select ID Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {kycLevel === 1 && (
                      <>
                        <SelectItem value="bvn">Bank Verification Number (BVN)</SelectItem>
                        <SelectItem value="nin">National Identity Number (NIN)</SelectItem>
                      </>
                    )}
                    {kycLevel === 2 && (
                      <>
                        <SelectItem value="passport">International Passport</SelectItem>
                        <SelectItem value="drivers_license">Driver's License</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="idNumber">Document Number</Label>
                <Input 
                  id="idNumber" 
                  placeholder="Enter the number exactly as it appears" 
                  value={idNumber}
                  onChange={e => setIdNumber(e.target.value)}
                  className="bg-background border-border"
                />
              </div>

              {kycLevel === 2 && (
                <div className="space-y-2">
                  <Label htmlFor="selfieUrl">Selfie with Document (URL for now)</Label>
                  <Input 
                    id="selfieUrl" 
                    placeholder="https://example.com/my-selfie.jpg" 
                    value={selfieUrl}
                    onChange={e => setSelfieUrl(e.target.value)}
                    className="bg-background border-border"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Upload a clear photo of your face holding the selected document.</p>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-12 mt-4"
                disabled={submitKycMutation.isPending || !idNumber}
              >
                {submitKycMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit for Verification
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}