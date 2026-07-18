export default function PactSwapLogo({ size = 40 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <path d="M50 5 L90 25 L90 55 C90 80 50 95 50 95 C50 95 10 80 10 55 L10 25 L50 5 Z" fill="#F5C242"/>
        <text x="50" y="62" fontFamily="Inter" fontSize="38" fontWeight="700" fill="#090909" textAnchor="middle">PS</text>
      </svg>
      <span className="text-2xl font-bold text-white tracking-tight">PACTSWAP</span>
    </div>
  );
}