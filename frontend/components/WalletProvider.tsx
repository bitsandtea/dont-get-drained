"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { ethers } from "ethers";

const TARGET_CHAIN_ID = 31337;

type WalletCtx = {
  wallet: string | null;
  connectWallet: () => Promise<void>;
};

const WalletContext = createContext<WalletCtx>({
  wallet: null,
  connectWallet: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<string | null>(null);

  // Auto-reconnect on mount if already authorized
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;

    // Check existing accounts without prompting
    eth
      .request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        if (accounts.length > 0) {
          setWallet(ethers.getAddress(accounts[0]));
        }
      })
      .catch(() => {});

    // Listen for account changes
    const onAccountsChanged = (accounts: string[]) => {
      setWallet(accounts.length > 0 ? ethers.getAddress(accounts[0]) : null);
    };
    eth.on("accountsChanged", onAccountsChanged);

    // Listen for chain changes — re-check accounts
    const onChainChanged = () => {
      eth
        .request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          setWallet(
            accounts.length > 0 ? ethers.getAddress(accounts[0]) : null
          );
        })
        .catch(() => {});
    };
    eth.on("chainChanged", onChainChanged);

    return () => {
      eth.removeListener("accountsChanged", onAccountsChanged);
      eth.removeListener("chainChanged", onChainChanged);
    };
  }, []);

  const connectWallet = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("MetaMask not found");
      return;
    }

    const provider = new ethers.BrowserProvider(eth);
    const network = await provider.getNetwork();

    if (Number(network.chainId) !== TARGET_CHAIN_ID) {
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }],
        });
      } catch (switchErr: unknown) {
        if ((switchErr as { code?: number })?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${TARGET_CHAIN_ID.toString(16)}`,
                chainName: "Anvil Local Fork",
                rpcUrls: ["http://127.0.0.1:8545"],
                nativeCurrency: {
                  name: "Ether",
                  symbol: "ETH",
                  decimals: 18,
                },
              },
            ],
          });
        } else {
          throw switchErr;
        }
      }
    }

    const signer = await provider.getSigner();
    setWallet(await signer.getAddress());
  }, []);

  return (
    <WalletContext.Provider value={{ wallet, connectWallet }}>
      {children}
    </WalletContext.Provider>
  );
}
