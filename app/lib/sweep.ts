import { Address, encodeFunctionData, erc20Abi, Hex } from 'viem';

import {
    createRecoveryPublicClient,
    createVersionedKernelAccount,
    createVersionedKernelClient,
    PasskeyCredential,
} from './account';
import { ChainBalances } from './balances';
import { AccountVersion, RecoveryChain } from './config';

interface Call {
    readonly to: Address;
    readonly value: bigint;
    readonly data: Hex;
}

export const buildSweepCalls = (
    recoveryChain: RecoveryChain,
    balances: ChainBalances,
    destination: Address,
): Call[] => {
    const tokenCalls: Call[] = recoveryChain.tokens
        .filter((token) => (balances.tokens[token.symbol] || 0n) > 0n)
        .map((token) => ({
            to: token.address,
            value: 0n,
            data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'transfer',
                args: [destination, balances.tokens[token.symbol]],
            }),
        }));

    // The paymaster covers gas, so the native balance can leave in full.
    const nativeCalls: Call[] =
        balances.native > 0n
            ? [{ to: destination, value: balances.native, data: '0x' as Hex }]
            : [];

    return tokenCalls.concat(nativeCalls);
};

export interface SweepResult {
    readonly userOpHash: Hex;
    readonly txHash: Hex;
    readonly success: boolean;
}

export const sweepChain = async ({
    version,
    recoveryChain,
    credential,
    index,
    rpId,
    balances,
    destination,
    bundlerOverride,
    onStatus,
}: {
    version: AccountVersion;
    recoveryChain: RecoveryChain;
    credential: PasskeyCredential;
    index: bigint;
    rpId: string;
    balances: ChainBalances;
    destination: Address;
    bundlerOverride?: string;
    onStatus: (status: string) => void;
}): Promise<SweepResult> => {
    const calls = buildSweepCalls(recoveryChain, balances, destination);
    if (calls.length === 0) {
        throw new Error('Nothing to move on this chain');
    }

    const publicClient = createRecoveryPublicClient(recoveryChain);
    const account = await createVersionedKernelAccount({
        version,
        credential,
        index,
        rpId,
        publicClient,
    });
    const kernelClient = createVersionedKernelClient({
        account,
        recoveryChain,
        publicClient,
        bundlerOverride,
    });

    onStatus('Sign the user operation with your passkey');
    const userOpHash = await kernelClient.sendUserOperation({ calls });

    onStatus('Submitted, waiting for inclusion');
    const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
    });

    return {
        userOpHash,
        txHash: receipt.receipt.transactionHash,
        success: receipt.success,
    };
};
