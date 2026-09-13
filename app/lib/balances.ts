import { Address, erc20Abi } from 'viem';

import { createRecoveryPublicClient } from './account';
import { RecoveryChain } from './config';

export interface ChainBalances {
    readonly native: bigint;
    readonly tokens: Readonly<Record<string, bigint>>;
}

export const fetchChainBalances = async (
    recoveryChain: RecoveryChain,
    address: Address,
): Promise<ChainBalances> => {
    const publicClient = createRecoveryPublicClient(recoveryChain);

    const [native, tokenBalances] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.multicall({
            allowFailure: false,
            contracts: recoveryChain.tokens.map((token) => ({
                address: token.address,
                abi: erc20Abi,
                functionName: 'balanceOf' as const,
                args: [address] as const,
            })),
        }),
    ]);

    return {
        native,
        tokens: Object.fromEntries(
            recoveryChain.tokens.map((token, i) => [token.symbol, tokenBalances[i]]),
        ),
    };
};

export const hasAnythingToMove = (balances: ChainBalances): boolean =>
    balances.native > 0n ||
    Object.keys(balances.tokens).some((symbol) => balances.tokens[symbol] > 0n);
