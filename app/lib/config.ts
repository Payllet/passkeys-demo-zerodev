import { Address, Chain } from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';
import { arbitrum, bsc, mainnet, optimism, polygon } from 'viem/chains';

export const entryPoint = {
    address: entryPoint07Address,
    version: '0.7',
} as const;

/**
 * Passkeys are readable only from the domain they were registered against, so
 * the relying party defaults to whatever domain is serving this page. Builds
 * served from a different host than the one users registered on set the
 * override instead.
 */
export const getRpId = (): string =>
    process.env.NEXT_PUBLIC_RP_ID || window.location.hostname;

const PIMLICO_URL = process.env.NEXT_PUBLIC_PIMLICO_URL;
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
const ANKR_API_KEY = process.env.NEXT_PUBLIC_ANKR_API_KEY;

export const PIMLICO_POLICY_ID = process.env.NEXT_PUBLIC_PIMLICO_POLICY_ID;

export const hasBuiltInBundler = Boolean(PIMLICO_URL && PIMLICO_API_KEY);

export interface AccountVersion {
    readonly id: string;
    readonly label: string;
    readonly kernelVersion: '0.3.1';
    /**
     * Folded into the CREATE2 salt, so each validator yields a different wallet
     * address for one and the same passkey.
     */
    readonly validatorAddress: Address;
    readonly isCurrent: boolean;
}

/** Every generation the Payllet clients have shipped, oldest first. */
export const ACCOUNT_VERSIONS: readonly AccountVersion[] = [
    {
        id: 'v1',
        label: 'permissionless 0.2.x',
        kernelVersion: '0.3.1',
        validatorAddress: '0xbA45a2BFb8De3D24cA9D7F1B551E14dFF5d690Fd',
        isCurrent: false,
    },
    {
        id: 'v2',
        label: 'permissionless 0.4.0',
        kernelVersion: '0.3.1',
        validatorAddress: '0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69',
        isCurrent: true,
    },
];

export const CURRENT_VERSION: AccountVersion = ACCOUNT_VERSIONS.filter(
    (version) => version.isCurrent,
)[0];

export interface RecoveryToken {
    readonly symbol: string;
    readonly address: Address;
    readonly decimals: number;
}

export interface RecoveryChain {
    readonly chain: Chain;
    readonly ankrName: string;
    readonly tokens: readonly RecoveryToken[];
}

export const RECOVERY_CHAINS: readonly RecoveryChain[] = [
    {
        chain: mainnet,
        ankrName: 'eth',
        tokens: [
            { symbol: 'USDT', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
            { symbol: 'USDC', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
        ],
    },
    {
        chain: arbitrum,
        ankrName: 'arbitrum',
        tokens: [
            { symbol: 'USDT', address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6 },
            { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
        ],
    },
    {
        chain: optimism,
        ankrName: 'optimism',
        tokens: [
            { symbol: 'USDT', address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', decimals: 6 },
            { symbol: 'USDC', address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', decimals: 6 },
        ],
    },
    {
        chain: polygon,
        ankrName: 'polygon',
        tokens: [
            { symbol: 'USDT', address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6 },
            { symbol: 'USDC', address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6 },
        ],
    },
    {
        chain: bsc,
        ankrName: 'bsc',
        tokens: [
            { symbol: 'USDT', address: '0x55d398326f99059ff775485246999027b3197955', decimals: 18 },
            { symbol: 'USDC', address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
        ],
    },
];

export const rpcUrl = ({ ankrName, chain }: RecoveryChain): string | undefined =>
    ANKR_API_KEY
        ? `https://rpc.ankr.com/${ankrName}/${ANKR_API_KEY}`
        : chain.rpcUrls.default.http[0];

/**
 * `override` lets an operator point the sweep at their own bundler, which keeps
 * the page usable on a deployment that carries no Pimlico key of its own.
 */
export const bundlerUrl = (chain: Chain, override?: string): string => {
    const trimmed = override?.trim();
    if (trimmed) {
        return trimmed.replace('{chainId}', String(chain.id));
    }
    if (!hasBuiltInBundler) {
        throw new Error(
            'No bundler configured. Paste a bundler RPC URL in the sweep settings, or build with NEXT_PUBLIC_PIMLICO_URL and NEXT_PUBLIC_PIMLICO_API_KEY.',
        );
    }
    return `${PIMLICO_URL}${chain.id}/rpc?apikey=${PIMLICO_API_KEY}`;
};
