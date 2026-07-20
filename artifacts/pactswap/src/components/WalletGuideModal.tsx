/**
 * WalletGuideModal
 *
 * Shown on Chrome Android (and other mobile browsers) when window.ethereum is
 * not available. Instead of WalletConnect QR (useless when the QR is on your
 * own screen), we give deep links that open the current page inside the
 * wallet's built-in browser where window.ethereum is injected automatically.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Smartphone } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WalletGuideModal({ open, onClose }: Props) {
  const currentUrl = window.location.href;
  // MetaMask deep link: opens dapp inside MetaMask Mobile browser
  const metamaskUrl = `https://metamask.app.link/dapp/${window.location.hostname}${window.location.pathname}${window.location.search}`;
  // Trust Wallet deep link
  const trustUrl = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(currentUrl)}`;
  // Binance Web3 Wallet deep link
  const binanceUrl = `https://app.binance.com/cedefi/en/discovery/browser?url=${encodeURIComponent(currentUrl)}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Smartphone className="h-5 w-5 text-primary" />
            Open in Your Wallet Browser
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Chrome can't connect to your wallet directly. Tap a button below —
            it opens this page inside your wallet's browser, where the
            connection works automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-1">
          {/* MetaMask */}
          <a href={metamaskUrl} onClick={onClose}>
            <Button className="w-full h-12 bg-[#E8831D] hover:bg-[#d4731a] text-white font-semibold justify-between px-4">
              <span className="flex items-center gap-2">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
                  className="h-6 w-6"
                  alt=""
                />
                Open in MetaMask
              </span>
              <ExternalLink className="h-4 w-4 opacity-70" />
            </Button>
          </a>

          {/* Trust Wallet */}
          <a href={trustUrl} onClick={onClose}>
            <Button className="w-full h-12 bg-[#3375BB] hover:bg-[#2d65a8] text-white font-semibold justify-between px-4">
              <span className="flex items-center gap-2">
                <img
                  src="https://trustwallet.com/assets/images/media/assets/trust_platform.svg"
                  className="h-6 w-6"
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                Open in Trust Wallet
              </span>
              <ExternalLink className="h-4 w-4 opacity-70" />
            </Button>
          </a>

          {/* Binance */}
          <a href={binanceUrl} onClick={onClose}>
            <Button className="w-full h-12 bg-[#F0B90B] hover:bg-[#d9a60a] text-black font-semibold justify-between px-4">
              <span className="flex items-center gap-2">
                <img
                  src="https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png"
                  className="h-6 w-6 rounded-full"
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                Open in Binance Wallet
              </span>
              <ExternalLink className="h-4 w-4 opacity-70" />
            </Button>
          </a>

          <div className="rounded-md bg-muted/20 border border-border/40 p-3 text-xs text-muted-foreground">
            💡 Tapping any button opens your wallet app and loads this page
            inside it — your address connects automatically, no QR code needed.
          </div>
        </div>

        <div className="text-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground text-xs"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
