import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import PactSwapLogo from "@/components/PactSwapLogo";
import { Shield, Zap, CheckCircle2, TrendingUp, Users, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden flex flex-col items-center justify-center min-h-[80vh]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background z-0 pointer-events-none" />
        
        <div className="container relative z-10 mx-auto px-4 text-center max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex justify-center mb-8"
          >
            <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              <Shield className="mr-2 h-4 w-4" />
              BNB Chain Escrow Now Live
            </div>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-black tracking-tight text-white mb-6 leading-tight"
          >
            Trade with Trust.<br />
            <span className="text-primary drop-shadow-[0_0_20px_rgba(245,194,66,0.3)]">PACTSWAP.</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
          >
            The premium dark-mode P2P USDT escrow trading platform. Zero counterparty risk. Every trade protected by immutable on-chain smart contracts.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button size="lg" asChild className="h-14 px-8 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_30px_rgba(245,194,66,0.3)] w-full sm:w-auto">
              <Link href="/signup">Start Trading <ArrowRight className="ml-2 h-5 w-5" /></Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-14 px-8 text-lg font-semibold border-border hover:bg-muted w-full sm:w-auto">
              <Link href="/marketplace">View Marketplace</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Stats Banner */}
      <section className="border-y border-border bg-card">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="flex flex-col items-center justify-center p-4">
              <span className="text-4xl font-black text-white mb-2">$12.4M+</span>
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Volume</span>
            </div>
            <div className="flex flex-col items-center justify-center p-4">
              <span className="text-4xl font-black text-white mb-2">4,289</span>
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Traders</span>
            </div>
            <div className="flex flex-col items-center justify-center p-4">
              <span className="text-4xl font-black text-white mb-2">18,500+</span>
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Completed Trades</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Uncompromising Security</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">We built PACTSWAP because trust should be cryptographic, not optional.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-card p-8 rounded-xl border border-border hover:border-primary/50 transition-colors">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                <Shield className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">On-Chain Escrow</h3>
              <p className="text-muted-foreground leading-relaxed">
                Funds are locked in a BNB Chain smart contract the moment an order is opened. We never hold your crypto—the blockchain does.
              </p>
            </div>
            
            <div className="bg-card p-8 rounded-xl border border-border hover:border-primary/50 transition-colors">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                <Zap className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Fast Settlement</h3>
              <p className="text-muted-foreground leading-relaxed">
                Average trade completion time under 4 minutes. Real-time status updates and instant crypto release upon payment confirmation.
              </p>
            </div>
            
            <div className="bg-card p-8 rounded-xl border border-border hover:border-primary/50 transition-colors">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                <CheckCircle2 className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Verified Traders</h3>
              <p className="text-muted-foreground leading-relaxed">
                Strict KYC requirements and a transparent reputation system ensure you only deal with serious, verified counterparties.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Three steps to a secure trade.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0 z-0"></div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-background border-2 border-primary rounded-full flex items-center justify-center text-3xl font-black text-primary mb-6 shadow-[0_0_15px_rgba(245,194,66,0.2)]">1</div>
              <h3 className="text-xl font-bold text-white mb-3">Open a Trade</h3>
              <p className="text-muted-foreground">Find an offer in the marketplace or create your own. Crypto is instantly locked in escrow.</p>
            </div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-background border-2 border-primary rounded-full flex items-center justify-center text-3xl font-black text-primary mb-6 shadow-[0_0_15px_rgba(245,194,66,0.2)]">2</div>
              <h3 className="text-xl font-bold text-white mb-3">Transfer Fiat</h3>
              <p className="text-muted-foreground">Send Naira to the seller's bank account via standard transfer and mark as paid.</p>
            </div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-background border-2 border-primary rounded-full flex items-center justify-center text-3xl font-black text-primary mb-6 shadow-[0_0_15px_rgba(245,194,66,0.2)]">3</div>
              <h3 className="text-xl font-bold text-white mb-3">Crypto Released</h3>
              <p className="text-muted-foreground">Seller confirms payment receipt. Smart contract instantly releases USDT to the buyer's wallet.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background border-t border-border py-12 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <PactSwapLogo size={24} />
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-primary transition-colors">Dispute Resolution</a>
            </div>
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} PACTSWAP. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}