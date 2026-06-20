import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, type Signer } from "ethers";
import { AMOY_CHAIN } from "../constants/network";

interface WalletState {
  address: string | null;
  chainId: string | null;
  signer: Signer | null;
  isConnecting: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    signer: null,
    isConnecting: false,
    error: null,
  });

  const switchToAmoy = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: AMOY_CHAIN.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [AMOY_CHAIN],
        });
      } else {
        throw switchError;
      }
    }
  };

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setState((s) => ({ ...s, error: "No wallet found. Install MetaMask." }));
      return;
    }
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);

      const network = await provider.getNetwork();
      const chainId = "0x" + network.chainId.toString(16);
      if (chainId !== AMOY_CHAIN.chainId) {
        await switchToAmoy();
      }

      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      setState({ address, chainId: AMOY_CHAIN.chainId, signer, isConnecting: false, error: null });
    } catch (err: any) {
      setState((s) => ({ ...s, isConnecting: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accounts: string[]) =>
      setState((s) => ({ ...s, address: accounts[0] ?? null }));
    const handleChainChanged = (chainId: string) =>
      setState((s) => ({ ...s, chainId }));

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  return { ...state, connect };
}