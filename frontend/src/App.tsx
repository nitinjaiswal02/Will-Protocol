import { ConnectWallet } from "./components/ConnectWallet";

export default function App() {
  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl text-parchment tracking-tight">
            Will Protocol
          </h1>
          <p className="mt-2 text-sm text-slate font-body">
            A decentralized inheritance vault for digital assets
          </p>
        </div>
        <ConnectWallet />
      </div>
    </div>
  );
}