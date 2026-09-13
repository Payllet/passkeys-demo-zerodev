import { createSmartAccountClient } from 'permissionless';
import { toKernelSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { Address, createPublicClient, Hex, http, PublicClient } from 'viem';
import { toWebAuthnAccount } from 'viem/account-abstraction';

import {
    AccountVersion,
    bundlerUrl,
    entryPoint,
    PIMLICO_POLICY_ID,
    RECOVERY_CHAINS,
    RecoveryChain,
    rpcUrl,
} from './config';

export interface PasskeyCredential {
    /** base64url credential ID, exactly as WebAuthn reports it. */
    readonly id: string;
    /** Uncompressed P-256 key, 0x04 || x || y. */
    readonly publicKey: Hex;
}

export const createRecoveryPublicClient = (
    recoveryChain: RecoveryChain,
): PublicClient =>
    createPublicClient({
        chain: recoveryChain.chain,
        transport: http(rpcUrl(recoveryChain)),
    }) as PublicClient;

export const createVersionedKernelAccount = ({
    version,
    credential,
    index,
    rpId,
    publicClient,
}: {
    version: AccountVersion;
    credential: PasskeyCredential;
    index: bigint;
    rpId: string;
    publicClient: PublicClient;
}) =>
    toKernelSmartAccount({
        client: publicClient,
        entryPoint,
        owners: [toWebAuthnAccount({ credential, rpId })],
        version: version.kernelVersion,
        validatorAddress: version.validatorAddress,
        index,
    });

/**
 * The factory is deployed at one address on every chain, so a version's account
 * address does not depend on which chain it is derived against.
 */
export const deriveVersionAddress = async (
    version: AccountVersion,
    credential: PasskeyCredential,
    index: bigint,
    rpId: string,
): Promise<Address> => {
    const account = await createVersionedKernelAccount({
        version,
        credential,
        index,
        rpId,
        publicClient: createRecoveryPublicClient(RECOVERY_CHAINS[0]),
    });
    return account.address;
};

export const createVersionedKernelClient = ({
    account,
    recoveryChain,
    publicClient,
    bundlerOverride,
}: {
    account: Awaited<ReturnType<typeof createVersionedKernelAccount>>;
    recoveryChain: RecoveryChain;
    publicClient: PublicClient;
    bundlerOverride?: string;
}) => {
    const { chain } = recoveryChain;
    const transport = http(bundlerUrl(chain, bundlerOverride));

    const pimlicoClient = createPimlicoClient({ transport, entryPoint, chain });

    return createSmartAccountClient({
        account,
        chain,
        client: publicClient,
        bundlerTransport: transport,
        paymaster: pimlicoClient,
        paymasterContext: PIMLICO_POLICY_ID
            ? { sponsorshipPolicyId: PIMLICO_POLICY_ID }
            : undefined,
        userOperation: {
            estimateFeesPerGas: async () =>
                (await pimlicoClient.getUserOperationGasPrice()).fast,
        },
    });
};
