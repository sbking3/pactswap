import { useState, useEffect } from "react";
import { useGetMe, useUpdateProfile, useUpdateBankDetails, useGetMyStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, User, Building, Settings, Share2, Copy } from "lucide-react";

export default function Profile() {
  const { data: user, isLoading: userLoading, refetch: refetchUser } = useGetMe();
  const { data: stats, isLoading: statsLoading } = useGetMyStats();

  const updateProfileMutation = useUpdateProfile();
  const updateBankMutation = useUpdateBankDetails();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Nigeria");
  
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setCountry(user.country || "Nigeria");
      
      setBankName(user.bankName || "");
      setAccountNumber(user.accountNumber || "");
      setAccountName(user.accountName || "");
    }
  }, [user]);

  if (userLoading || statsLoading || !user) {
    return (
      <div className="flex-1 flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({ data: { name, phone, country } }, {
      onSuccess: () => {
        toast.success("Profile updated successfully");
        refetchUser();
      },
      onError: (error) => toast.error((error as any).error || "Failed to update profile")
    });
  };

  const handleUpdateBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName || !accountNumber || !accountName) {
      toast.error("Please fill all bank details");
      return;
    }
    updateBankMutation.mutate({ data: { bankName, accountNumber, accountName } }, {
      onSuccess: () => {
        toast.success("Bank details securely saved");
        refetchUser();
      },
      onError: (error) => toast.error((error as any).error || "Failed to update bank details")
    });
  };

  const copyProfileLink = () => {
    const url = `${window.location.origin}/users/${user.walletAddress}`;
    navigator.clipboard.writeText(url);
    toast.success("Public profile link copied");
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Profile Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account details and bank information.</p>
        </div>
        <Button variant="outline" onClick={copyProfileLink} className="border-border hover:bg-muted">
          <Share2 className="w-4 h-4 mr-2" /> Share Profile
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-card border-border shadow-md text-center">
            <CardContent className="pt-8 pb-6">
              <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-4xl mx-auto mb-4 border-2 border-primary/50">
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <h2 className="text-xl font-bold text-white">{user.name}</h2>
              <p className="text-sm font-mono text-muted-foreground mt-2 bg-muted/50 py-1 px-2 rounded inline-block truncate max-w-[200px]">
                {user.walletAddress}
              </p>
              
              <div className="mt-6 flex justify-center gap-4 text-sm">
                <div className="flex flex-col items-center">
                  <span className="text-muted-foreground">Rating</span>
                  <span className="text-primary font-bold">{stats?.rating?.toFixed(1) || '5.0'} / 5.0</span>
                </div>
                <div className="w-px bg-border"></div>
                <div className="flex flex-col items-center">
                  <span className="text-muted-foreground">Trades</span>
                  <span className="text-white font-bold">{stats?.totalTrades || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-md text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" /> Security
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">KYC Level</span>
                <span className="font-bold text-white">{user.kycLevel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Email Status</span>
                <span className="text-green-500 text-sm font-medium">Verified</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">2FA Setup</span>
                <span className={user.twoFactorEnabled ? "text-green-500 text-sm font-medium" : "text-amber-500 text-sm font-medium"}>
                  {user.twoFactorEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <User className="w-5 h-5 text-primary" /> Personal Information
              </CardTitle>
              <CardDescription>This information is used for matching with counterparty payments.</CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdateProfile}>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (Cannot be changed)</Label>
                    <Input 
                      id="email" 
                      value={user.email} 
                      disabled 
                      className="bg-muted text-muted-foreground border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input 
                      id="phone" 
                      value={phone} 
                      onChange={e => setPhone(e.target.value)} 
                      placeholder="+234..."
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input 
                      id="country" 
                      value={country} 
                      onChange={e => setCountry(e.target.value)} 
                      className="bg-background border-border"
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/10 border-t border-border/50 px-6 py-4 justify-end">
                <Button 
                  type="submit" 
                  disabled={updateProfileMutation.isPending}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  {updateProfileMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card className="bg-card border-border shadow-md">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Building className="w-5 h-5 text-primary" /> Bank Details
              </CardTitle>
              <CardDescription>Your bank details are only shown to buyers after a trade starts.</CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdateBank}>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input 
                      id="bankName" 
                      value={bankName} 
                      onChange={e => setBankName(e.target.value)} 
                      placeholder="e.g. Zenith Bank"
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input 
                      id="accountNumber"
                      type="tel"
                      inputMode="numeric"
                      maxLength={16}
                      value={accountNumber} 
                      onChange={e => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 16))} 
                      placeholder="0123456789"
                      className="bg-background border-border font-mono tracking-widest"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input 
                      id="accountName" 
                      value={accountName} 
                      onChange={e => setAccountName(e.target.value)} 
                      placeholder="Name matching your bank account"
                      className="bg-background border-border"
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/10 border-t border-border/50 px-6 py-4 justify-end">
                <Button 
                  type="submit" 
                  disabled={updateBankMutation.isPending}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  {updateBankMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Bank Details
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}