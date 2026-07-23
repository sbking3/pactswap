import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import PactSwapLogo from "@/components/PactSwapLogo";
import SecurityBanner from "@/components/SecurityBanner";
import { Menu, User as UserIcon, LogOut, Activity, Settings, Plus, List, ShoppingCart } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLogout } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        logout();
        setLocation("/");
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <SecurityBanner />
      
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <PactSwapLogo size={32} />
          </Link>
          
          <div className="flex items-center gap-6">
            {user ? (
              <>
                <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
                  <Link href="/dashboard" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"><Activity className="w-4 h-4" /> Dashboard</Link>
                  <Link href="/marketplace" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Marketplace</Link>
                  <Link href="/orders" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"><List className="w-4 h-4" /> Orders</Link>
                  <Link href="/offers/create" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"><Plus className="w-4 h-4" /> Create Offer</Link>
                </nav>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2 border-border/50 bg-background hover:bg-muted">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      {/* Show username; fall back to truncated wallet address */}
                      <span className="hidden sm:inline-block text-sm font-medium max-w-[120px] truncate">
                        {user.name || `${user.walletAddress.slice(0, 6)}…${user.walletAddress.slice(-4)}`}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                    <div className="flex items-center justify-start gap-2 p-2">
                      <div className="flex flex-col space-y-1 leading-none">
                        {user.name && <p className="font-medium">{user.name}</p>}
                        {user.walletAddress && (
                          <p className="w-[200px] truncate text-xs text-muted-foreground font-mono">
                            {user.walletAddress}
                          </p>
                        )}
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="w-full flex items-center cursor-pointer">
                        <UserIcon className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings/security" className="w-full flex items-center cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Security</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors">
                  Login
                </Link>
                <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_0_15px_rgba(245,194,66,0.3)]">
                  <Link href="/signup">Start Trading</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}