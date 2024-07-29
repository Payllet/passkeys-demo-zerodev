import { http, createConfig } from "@wagmi/core";
import { bsc, sepolia } from "@wagmi/core/chains";

export const config = createConfig({
  chains: [bsc, sepolia],
  transports: {
    [bsc.id]: http(),
    [sepolia.id]: http(),
  },
});
