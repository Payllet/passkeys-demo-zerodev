"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Address, formatUnits, Hex, isHex } from "viem";

import { deriveVersionAddress, PasskeyCredential } from "./lib/account";
import {
    ChainBalances,
    fetchChainBalances,
    hasAnythingToMove,
} from "./lib/balances";
import {
    ACCOUNT_VERSIONS,
    AccountVersion,
    CURRENT_VERSION,
    getRpId,
    hasBuiltInBundler,
    RECOVERY_CHAINS,
    RecoveryChain,
} from "./lib/config";
import { sweepChain, SweepResult } from "./lib/sweep";
import { extractCredential } from "./lib/webauthn";

type BalanceCell =
    | { status: "loading" }
    | { status: "ok"; balances: ChainBalances }
    | { status: "error"; message: string };

type SweepState =
    | { status: "idle" }
    | { status: "busy"; message: string }
    | { status: "done"; result: SweepResult }
    | { status: "error"; message: string };

const cellKey = (versionId: string, chainId: number) => `${versionId}:${chainId}`;

const errorMessage = (err: unknown): string => {
    if (err && typeof err === "object" && "shortMessage" in err) {
        return String((err as { shortMessage: unknown }).shortMessage);
    }
    return err instanceof Error ? err.message : String(err);
};

const Amount = ({ value, decimals }: { value: bigint; decimals: number }) => (
    <span className={value > 0n ? "text-emerald-600 font-medium" : "text-neutral-400"}>
        {formatUnits(value, decimals)}
    </span>
);

export default function Home() {
    const [rpId, setRpId] = useState("");
    const [credential, setCredential] = useState<PasskeyCredential | null>(null);
    const [indexInput, setIndexInput] = useState("0");
    const [manualId, setManualId] = useState("");
    const [manualKey, setManualKey] = useState("");
    const [bundlerOverride, setBundlerOverride] = useState("");
    const [addresses, setAddresses] = useState<Record<string, Address>>({});
    const [cells, setCells] = useState<Record<string, BalanceCell>>({});
    const [sweeps, setSweeps] = useState<Record<string, SweepState>>({});
    const [identifying, setIdentifying] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => setRpId(getRpId()), []);

    const index = useMemo<bigint | null>(() => {
        try {
            return BigInt(indexInput.trim() || "0");
        } catch {
            return null;
        }
    }, [indexInput]);

    const destination = addresses[CURRENT_VERSION.id];

    const loadCell = useCallback(
        async (
            version: AccountVersion,
            recoveryChain: RecoveryChain,
            address: Address,
        ) => {
            const key = cellKey(version.id, recoveryChain.chain.id);
            setCells((prev) => ({ ...prev, [key]: { status: "loading" } }));
            try {
                const balances = await fetchChainBalances(recoveryChain, address);
                setCells((prev) => ({ ...prev, [key]: { status: "ok", balances } }));
            } catch (err) {
                setCells((prev) => ({
                    ...prev,
                    [key]: { status: "error", message: errorMessage(err) },
                }));
            }
        },
        [],
    );

    const loadAll = useCallback(
        async (passkey: PasskeyCredential, accountIndex: bigint, relyingParty: string) => {
            setLoading(true);
            setError(null);
            setAddresses({});
            setCells({});
            setSweeps({});
            try {
                const derived = await Promise.all(
                    ACCOUNT_VERSIONS.map(
                        async (version) =>
                            [
                                version,
                                await deriveVersionAddress(
                                    version,
                                    passkey,
                                    accountIndex,
                                    relyingParty,
                                ),
                            ] as const,
                    ),
                );
                setAddresses(
                    Object.fromEntries(
                        derived.map(([version, address]) => [version.id, address]),
                    ),
                );
                await Promise.all(
                    derived.map(([version, address]) =>
                        Promise.all(
                            RECOVERY_CHAINS.map((recoveryChain) =>
                                loadCell(version, recoveryChain, address),
                            ),
                        ),
                    ),
                );
            } catch (err) {
                setError(`Address derivation failed: ${errorMessage(err)}`);
            } finally {
                setLoading(false);
            }
        },
        [loadCell],
    );

    useEffect(() => {
        if (credential && index !== null && rpId) {
            loadAll(credential, index, rpId);
        }
    }, [credential, index, rpId, loadAll]);

    const refreshBalances = () => {
        ACCOUNT_VERSIONS.forEach((version) => {
            const address = addresses[version.id];
            if (!address) return;
            RECOVERY_CHAINS.forEach((recoveryChain) =>
                loadCell(version, recoveryChain, address),
            );
        });
    };

    const identify = async () => {
        setIdentifying(true);
        setError(null);
        try {
            const { publicKey, credentialId } = await extractCredential(getRpId());
            setCredential({ id: credentialId, publicKey });
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setIdentifying(false);
        }
    };

    const useManualCredential = () => {
        const id = manualId.trim();
        const publicKey = manualKey.trim();
        if (!id || !isHex(publicKey)) {
            setError(
                "Manual entry needs a base64url credential ID and a hex public key.",
            );
            return;
        }
        setError(null);
        setCredential({ id, publicKey: publicKey as Hex });
    };

    const sweep = async (version: AccountVersion, recoveryChain: RecoveryChain) => {
        const key = cellKey(version.id, recoveryChain.chain.id);
        const cell = cells[key];
        if (!credential || index === null || !destination || cell?.status !== "ok") {
            return;
        }

        const setSweep = (state: SweepState) =>
            setSweeps((prev) => ({ ...prev, [key]: state }));

        setSweep({ status: "busy", message: "Preparing user operation" });
        try {
            const result = await sweepChain({
                version,
                recoveryChain,
                credential,
                index,
                rpId: getRpId(),
                balances: cell.balances,
                destination,
                bundlerOverride,
                onStatus: (message) => setSweep({ status: "busy", message }),
            });
            setSweep({ status: "done", result });
            loadCell(version, recoveryChain, addresses[version.id]);
            loadCell(CURRENT_VERSION, recoveryChain, destination);
        } catch (err) {
            setSweep({ status: "error", message: errorMessage(err) });
        }
    };

    const anySweepBusy = Object.keys(sweeps).some(
        (key) => sweeps[key].status === "busy",
    );
    const canSweep = hasBuiltInBundler || bundlerOverride.trim().length > 0;

    return (
        <main className="mx-auto max-w-5xl p-6 text-sm text-neutral-800">
            <h1 className="text-xl font-semibold">Payllet account recovery</h1>
            <p className="mt-2 max-w-3xl text-neutral-600">
                Each release of the smart-account library derives a different wallet
                address from the same passkey. This page lists every address, shows what
                each one holds, and moves the funds to the current one. It talks only to
                public RPC endpoints and a bundler, so it keeps working while the Payllet
                API is down.
            </p>
            <p className="mt-2 text-neutral-500">
                Reading passkeys for{" "}
                <code className="rounded bg-neutral-100 px-1">{rpId || "…"}</code>. A
                passkey registered on another domain will not appear here.
            </p>

            <section className="mt-6 border-t pt-5">
                <h2 className="font-semibold">1. Identify the passkey</h2>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={identify}
                        disabled={identifying || loading}
                        className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-40"
                    >
                        {identifying ? "Waiting for two signatures…" : "Identify passkey"}
                    </button>
                    <label className="flex items-center gap-2">
                        Account index
                        <input
                            value={indexInput}
                            onChange={(e) => setIndexInput(e.target.value)}
                            className="w-16 rounded border px-2 py-1"
                        />
                    </label>
                    {index === null && (
                        <span className="text-red-600">index must be a number</span>
                    )}
                </div>
                <p className="mt-2 text-neutral-500">
                    The passkey is asked to sign twice: one signature narrows its public
                    key to two candidates, the second one picks the right one.
                </p>

                <details className="mt-3">
                    <summary className="cursor-pointer text-neutral-600">
                        Enter a credential by hand instead
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                        <input
                            placeholder="Credential ID (base64url)"
                            value={manualId}
                            onChange={(e) => setManualId(e.target.value)}
                            className="w-full max-w-xl rounded border px-2 py-1"
                        />
                        <input
                            placeholder="Public key (0x04…)"
                            value={manualKey}
                            onChange={(e) => setManualKey(e.target.value)}
                            className="w-full max-w-xl rounded border px-2 py-1"
                        />
                        <button
                            type="button"
                            onClick={useManualCredential}
                            disabled={loading}
                            className="w-fit rounded border px-3 py-1.5 disabled:opacity-40"
                        >
                            Use this credential
                        </button>
                        <span className="text-neutral-500">
                            Enough to look up addresses and balances. Moving funds still
                            needs the passkey itself on this device.
                        </span>
                    </div>
                </details>

                {credential && (
                    <div className="mt-3 break-all font-mono text-xs text-neutral-600">
                        <div>id: {credential.id}</div>
                        <div>key: {credential.publicKey}</div>
                    </div>
                )}

                {error && (
                    <p className="mt-3 whitespace-pre-wrap text-red-600">{error}</p>
                )}
            </section>

            {!hasBuiltInBundler && (
                <section className="mt-6 border-t pt-5">
                    <h2 className="font-semibold">Bundler</h2>
                    <p className="mt-1 text-neutral-600">
                        This build carries no bundler key, so balances are readable but
                        nothing can be moved yet. Paste a bundler RPC URL to enable the
                        transfers. Use <code>{"{chainId}"}</code> where the URL needs the
                        chain id.
                    </p>
                    <input
                        placeholder="https://api.pimlico.io/v2/{chainId}/rpc?apikey=…"
                        value={bundlerOverride}
                        onChange={(e) => setBundlerOverride(e.target.value)}
                        className="mt-2 w-full max-w-2xl rounded border px-2 py-1 font-mono text-xs"
                    />
                </section>
            )}

            <section className="mt-6 border-t pt-5">
                <div className="flex items-center gap-3">
                    <h2 className="font-semibold">2. Accounts</h2>
                    <button
                        type="button"
                        onClick={refreshBalances}
                        disabled={!credential || loading || anySweepBusy}
                        className="rounded border px-2 py-1 disabled:opacity-40"
                    >
                        refresh balances
                    </button>
                </div>

                {!credential && (
                    <p className="mt-3 text-neutral-500">
                        Identify a passkey to see its addresses.
                    </p>
                )}

                {credential &&
                    ACCOUNT_VERSIONS.map((version) => {
                        const address = addresses[version.id];
                        return (
                            <div
                                key={version.id}
                                className={`mt-4 rounded border p-4 ${
                                    version.isCurrent
                                        ? "border-emerald-500"
                                        : "border-neutral-300"
                                }`}
                            >
                                <div className="flex flex-wrap items-baseline gap-2">
                                    <span className="font-semibold">{version.label}</span>
                                    {version.isCurrent && (
                                        <span className="rounded bg-emerald-100 px-1.5 text-xs text-emerald-700">
                                            current
                                        </span>
                                    )}
                                    <span className="font-mono text-xs text-neutral-500">
                                        validator {version.validatorAddress}
                                    </span>
                                </div>
                                <div className="mt-1 break-all font-mono text-xs">
                                    {address || (loading ? "deriving…" : "—")}
                                </div>

                                {address && (
                                    <table className="mt-3 w-full border-collapse">
                                        <thead>
                                            <tr className="text-left text-xs uppercase text-neutral-500">
                                                <th className="border-b py-1 pr-3">Chain</th>
                                                <th className="border-b py-1 pr-3">Native</th>
                                                {RECOVERY_CHAINS[0].tokens.map((token) => (
                                                    <th
                                                        key={token.symbol}
                                                        className="border-b py-1 pr-3"
                                                    >
                                                        {token.symbol}
                                                    </th>
                                                ))}
                                                {!version.isCurrent && (
                                                    <th className="border-b py-1">Move</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {RECOVERY_CHAINS.map((recoveryChain) => {
                                                const { chain } = recoveryChain;
                                                const key = cellKey(version.id, chain.id);
                                                const cell = cells[key];
                                                const sweepState: SweepState =
                                                    sweeps[key] || { status: "idle" };
                                                const explorer =
                                                    chain.blockExplorers?.default.url;
                                                const span =
                                                    1 + recoveryChain.tokens.length;
                                                return (
                                                    <tr key={chain.id} className="align-top">
                                                        <td className="border-b py-1 pr-3">
                                                            {chain.name}
                                                        </td>
                                                        {!cell || cell.status === "loading" ? (
                                                            <td
                                                                className="border-b py-1 text-neutral-400"
                                                                colSpan={span}
                                                            >
                                                                loading…
                                                            </td>
                                                        ) : cell.status === "error" ? (
                                                            <td
                                                                className="border-b py-1 text-red-600"
                                                                colSpan={span}
                                                            >
                                                                {cell.message}
                                                            </td>
                                                        ) : (
                                                            <>
                                                                <td className="border-b py-1 pr-3">
                                                                    <Amount
                                                                        value={cell.balances.native}
                                                                        decimals={
                                                                            chain.nativeCurrency
                                                                                .decimals
                                                                        }
                                                                    />{" "}
                                                                    <span className="text-xs text-neutral-400">
                                                                        {
                                                                            chain.nativeCurrency
                                                                                .symbol
                                                                        }
                                                                    </span>
                                                                </td>
                                                                {recoveryChain.tokens.map(
                                                                    (token) => (
                                                                        <td
                                                                            key={token.symbol}
                                                                            className="border-b py-1 pr-3"
                                                                        >
                                                                            <Amount
                                                                                value={
                                                                                    cell.balances
                                                                                        .tokens[
                                                                                        token.symbol
                                                                                    ] || 0n
                                                                                }
                                                                                decimals={
                                                                                    token.decimals
                                                                                }
                                                                            />
                                                                        </td>
                                                                    ),
                                                                )}
                                                            </>
                                                        )}
                                                        {!version.isCurrent && (
                                                            <td className="border-b py-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        sweep(
                                                                            version,
                                                                            recoveryChain,
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        !destination ||
                                                                        !canSweep ||
                                                                        anySweepBusy ||
                                                                        cell?.status !== "ok" ||
                                                                        !hasAnythingToMove(
                                                                            cell.balances,
                                                                        )
                                                                    }
                                                                    className="rounded border px-2 py-0.5 disabled:opacity-30"
                                                                >
                                                                    move
                                                                </button>
                                                                {sweepState.status ===
                                                                    "busy" && (
                                                                    <div className="text-xs text-neutral-500">
                                                                        {sweepState.message}
                                                                    </div>
                                                                )}
                                                                {sweepState.status ===
                                                                    "error" && (
                                                                    <div className="whitespace-pre-wrap text-xs text-red-600">
                                                                        {sweepState.message}
                                                                    </div>
                                                                )}
                                                                {sweepState.status ===
                                                                    "done" && (
                                                                    <div
                                                                        className={`text-xs ${
                                                                            sweepState.result
                                                                                .success
                                                                                ? "text-emerald-600"
                                                                                : "text-red-600"
                                                                        }`}
                                                                    >
                                                                        {sweepState.result
                                                                            .success
                                                                            ? "done"
                                                                            : "reverted"}{" "}
                                                                        {explorer ? (
                                                                            <a
                                                                                className="underline"
                                                                                href={`${explorer}/tx/${sweepState.result.txHash}`}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                            >
                                                                                tx
                                                                            </a>
                                                                        ) : (
                                                                            sweepState.result
                                                                                .txHash
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        );
                    })}
            </section>
        </main>
    );
}
