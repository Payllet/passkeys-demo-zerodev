import { bytesToHex } from '@noble/curves/abstract/utils';
import { secp256r1 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes } from '@noble/hashes/utils';
import { startAuthentication } from '@simplewebauthn/browser';
import { Hex, hexToBigInt, toHex } from 'viem';
import {
    base64UrlToBytes,
    bytesToBase64Url,
    serializePublicKey,
} from 'webauthn-p256';

export type AuthenticationResponseJSON = Awaited<
    ReturnType<typeof startAuthentication>
>;

export interface ExtractedCredential {
    publicKey: Hex;
    credentialId: string;
}

/**
 * A WebAuthn assertion does not carry the public key, but a P-256 signature can
 * be recovered to two candidate keys, only one of which is the signer's. Signing
 * a second challenge and keeping the candidate that appears in both recoveries
 * identifies the key without any server-side record of it.
 */
export async function extractCredential(rpId: string): Promise<ExtractedCredential> {
    const candidates: Hex[] = [];

    let iteration = 1;
    let cancellations = 0;

    while (candidates.length < 4 && cancellations < 3) {
        const challenge = bytesToBase64Url(new Uint8Array(32).fill(iteration++));

        let assertion: AuthenticationResponseJSON;
        try {
            assertion = await startAuthentication({ challenge, rpId });
        } catch (err) {
            // A relying party has to be the page's own domain or a parent of
            // it, so a host outside the passkey's domain fails on the first
            // prompt and will never succeed on a retry.
            if (err instanceof Error && err.name === 'SecurityError') {
                throw new Error(
                    `This page is served from ${window.location.hostname}, which is not allowed to read passkeys for ${rpId}. Open it on ${rpId} or a subdomain of it.`,
                );
            }
            cancellations++;
            continue;
        }

        const { authenticatorData, clientDataJSON, signature } = assertion.response;

        const signedMessageHash = bytesToHex(
            sha256(
                concatBytes(
                    base64UrlToBytes(authenticatorData),
                    sha256(base64UrlToBytes(clientDataJSON)),
                ),
            ),
        );
        const signatureHex = bytesToHex(base64UrlToBytes(signature));

        for (const recoveryBit of [0, 1]) {
            let uncompressed: Uint8Array;
            try {
                uncompressed = secp256r1.Signature.fromDER(signatureHex)
                    .addRecoveryBit(recoveryBit)
                    .recoverPublicKey(signedMessageHash)
                    .toRawBytes(false);
            } catch {
                continue;
            }

            // 0x04 prefix on the uncompressed form, then the two 32-byte coordinates.
            const offset = uncompressed.length === 65 ? 1 : 0;
            const candidate = serializePublicKey({
                prefix: offset ? uncompressed[0] : undefined,
                x: hexToBigInt(toHex(uncompressed.slice(offset, 32 + offset))),
                y: hexToBigInt(toHex(uncompressed.slice(32 + offset, 64 + offset))),
            });

            if (candidates.includes(candidate)) {
                return { publicKey: candidate, credentialId: assertion.id };
            }
            candidates.push(candidate);
        }
    }

    throw new Error(
        'Could not identify the passkey. Both prompts have to be answered with the same key.',
    );
}
