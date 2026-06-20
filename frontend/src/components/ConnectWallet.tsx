import { useWallet } from "../hooks/useWallet";

export function ConnectWallet() {
  const { address, isConnecting, error, connect } = useWallet();

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-6 shadow-xl shadow-black/40">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-body text-xs uppercase tracking-widest text-slate">
          Wallet Status
        </span>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            address ? "bg-brass" : "bg-slate/40"
          }`}
        />
      </div>

      {address ? (
        <div>
          <p className="font-mono text-sm text-parchment break-all">
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
          <p className="mt-1 font-body text-xs text-slate">
            Connected to Polygon Amoy
          </p>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={isConnecting}
          className="w-full rounded-lg bg-brass px-4 py-2.5 font-body font-medium text-ink transition-colors duration-150 hover:bg-brass/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      )}

      {error && <p className="mt-3 font-body text-sm text-rust">{error}</p>}
    </div>
  );
}