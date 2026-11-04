import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import PactSwapLogo from "@/components/PactSwapLogo";
import SecurityBanner from "@/components/SecurityBanner";
import { Menu, X, User as UserIcon, LogOut, Activity, Settings, Plus, List, ShoppingCart, LayoutDashboard, Store } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useLogout } from "@workspace/api-client-react";

const ADMIN = "0xf71c8e88aa5e433603fb76afcea62d02b9751338";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { sbUser, username: sbUsername, signOut } = useSupabaseAuth();
  const [, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        logout();
        setLocation("/");
      },
    });
  };

  const handleSbLogout = async () => {
    await signOut();
    setLocation("/");
  };

  const sbNavLinks = [
    { href: "/marketplace",  label: "Marketplace",  icon: ShoppingCart },
    { href: "/orders",       label: "Trade",        icon: List },
    { href: "/offers/create",label: "Create Offer", icon: Plus },
  ];

  const navLinks = user ? [
    { href: "/dashboard",    label: "Dashboard",    icon: Activity },
    { href: "/marketplace",  label: "Marketplace",  icon: ShoppingCart },
    { href: "/orders",       label: "Orders",       icon: List },
    { href: "/my-offers",    label: "My Listings",  icon: Store },
    { href: "/offers/create",label: "Create Offer", icon: Plus },
    ...(user.walletAddress.toLowerCase() === ADMIN
      ? [{ href: "/admin", label: "Admin", icon: LayoutDashboard, highlight: true }]
      : []),
  ] : [];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <SecurityBanner />

      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/">
            <PactSwapLogo size={32} />
          </Link>

          <div className="flex items-center gap-3">
            {!user && sbUser ? (
              <>
                <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
                  {sbNavLinks.map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href} className="transition-colors flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                      <Icon className="w-4 h-4" /> {label}
                    </Link>
                  ))}
                </nav>
                <span data-testid="sb-user" className="text-sm font-medium max-w-[200px] truncate">
                  {sbUsername ? `${sbUsername} · ${sbUser.email}` : sbUser.email}
                </span>
                <Button variant="outline" onClick={handleSbLogout} className="border-border/50">
                  <LogOut className="mr-2 h-4 w-4" /> Logout
                </Button>
              </>
            ) : user ? (
              <>
                {/* Desktop nav */}
                <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
                  {navLinks.map(({ href, label, icon: Icon, highlight }) => (
                    <Link
                      key={href}
                      href={href}
                      className={`transition-colors flex items-center gap-1.5 ${
                        highlight
                          ? "text-primary hover:text-primary/80 font-semibold"
                          : "text-muted-foreground hover:text-primary"
                      }`}
                    >
                      <Icon className="w-4 h-4" /> {label}
                    </Link>
                  ))}
                </nav>

                {/* Avatar dropdown (desktop) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2 border-border/50 bg-background hover:bg-muted">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                        {user.name?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <span className="hidden sm:inline-block text-sm font-medium max-w-[120px] truncate">
                        {user.name || `${user.walletAddress.slice(0, 6)}…${user.walletAddress.slice(-4)}`}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                    <div className="p-2">
                      {user.name && <p className="font-medium text-sm">{user.name}</p>}
                      <p className="w-[200px] truncate text-xs text-muted-foreground font-mono">
                        {user.walletAddress}
                      </p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="w-full flex items-center cursor-pointer">
                        <UserIcon className="mr-2 h-4 w-4" /> Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings/security" className="w-full flex items-center cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" /> Security
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" /> Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Mobile hamburger */}
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-72 bg-card border-border p-0 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                      <div>
                        <p className="font-semibold text-sm">{user.name || "My Account"}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
                          {user.walletAddress}
                        </p>
                      </div>
                    </div>
                    {/* Nav links */}
                    <nav className="flex flex-col gap-1 p-3 flex-1">
                      {navLinks.map(({ href, label, icon: Icon, highlight }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                            highlight
                              ? "text-primary bg-primary/10 hover:bg-primary/20"
                              : "text-muted-foreground hover:text-white hover:bg-muted"
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" /> {label}
                        </Link>
                      ))}
                      <Link
                        href="/profile"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-white hover:bg-muted transition-colors"
                      >
                        <UserIcon className="w-4 h-4" /> Profile
                      </Link>
                      <Link
                        href="/settings/security"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-white hover:bg-muted transition-colors"
                      >
                        <Settings className="w-4 h-4" /> Security
                      </Link>
                    </nav>
                    {/* Logout at bottom */}
                    <div className="p-3 border-t border-border">
                      <button
                        onClick={() => { setMobileOpen(false); handleLogout(); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" /> Log out
                      </button>
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            ) : (
              <div className="flex items-center gap-3">
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