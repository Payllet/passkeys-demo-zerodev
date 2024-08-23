"use client";

import {
  ZeroDevPaymasterClient,
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  gasTokenAddresses,
  getERC20PaymasterApproveCall,
} from "@zerodev/sdk";
import {
  WebAuthnMode,
  // toPasskeyValidator,
  // toWebAuthnKey
} from "@zerodev/passkey-validator";
import { bundlerActions, ENTRYPOINT_ADDRESS_V06 } from "permissionless";
import React, { useEffect, useState } from "react";
import {
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
  Hex,
  decodeFunctionData,
  keccak256,
  Address,
} from "viem";
import { sepolia } from "viem/chains";
import { EntryPoint } from "permissionless/types";
import { toWebAuthnKey } from "./passkeys/toWebAuthnKey";
import { toPasskeyValidator } from "./passkeys/toPasskeyValidator";
import {
  ERC20_TOKEN_BALANCEOF_ABI,
  ERC20_TOKEN_MINT_ABI,
  ERC20_TOKEN_APPROVE_ABI,
  ERC20_TOKEN_ALLOWANCE_ABI,
  ERC20_TOKEN_TRANSFER_ABI,
} from "./abi";
import { hexStringToUint8Array } from "./passkeys/utils";
import Moralis from "moralis";
import { EvmChain } from "@moralisweb3/common-evm-utils";

const BUNDLER_URL =
  "https://rpc.zerodev.app/api/v2/bundler/4babe2ab-9bae-4865-9e7a-f97ed5bccbea";
const PAYMASTER_URL =
  "https://rpc.zerodev.app/api/v2/paymaster/4babe2ab-9bae-4865-9e7a-f97ed5bccbea";
// const PASSKEY_SERVER_URL =
//     "https://passkeys.zerodev.app/api/v3/4babe2ab-9bae-4865-9e7a-f97ed5bccbea"
const PASSKEY_SERVER_URL = process.env.NEXT_PUBLIC_PASSKEY_SERVER_URL!;

const MORALIS_API_KEY = process.env.NEXT_PUBLIC_MORALIS_API_KEY!;

const CHAIN = sepolia;

import { getBalance } from "@wagmi/core";
import { config } from "./wagmi.config";
import { GetBalanceReturnType } from "wagmi/actions";

const publicClient = createPublicClient({
  transport: http(BUNDLER_URL),
});

let kernelAccount: any;
let kernelClient: any;
let paymasterClient: any;

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [balanceFetched, setBalanceFetched] = useState(false);
  const [username, setUsername] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [transferAmount, setTransferAmount] = useState(0);
  const [userId, setUserId] = useState(0);
  const [accessToken, setAccessToken] = useState("");
  const [accountAddress, setAccountAddress] = useState("");
  const [isKernelClientReady, setIsKernelClientReady] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSendingUserOp, setIsSendingUserOp] = useState(false);
  const [userOpHash, setUserOpHash] = useState("");
  const [userOpStatus, setUserOpStatus] = useState("");

  const [balance, setBalance] = useState(BigInt(0));
  const [balanceDecimals, setBalanceDecimals] = useState(0);

  const stablecoinAddress = gasTokenAddresses[CHAIN.id]["6TEST"];

  const createAccountAndClient = async (passkeyValidator: any) => {
    kernelAccount = await createKernelAccount(publicClient, {
      entryPoint: ENTRYPOINT_ADDRESS_V06,
      plugins: {
        sudo: passkeyValidator,
      },
      // index: BigInt(keccak256(hexStringToUint8Array(username))),
    });

    console.log("Kernel account created: ", kernelAccount.address);

    paymasterClient = await createZeroDevPaymasterClient({
      chain: CHAIN,
      transport: http(PAYMASTER_URL),
      entryPoint: ENTRYPOINT_ADDRESS_V06,
    });

    kernelClient = createKernelAccountClient({
      account: kernelAccount,
      chain: CHAIN,
      bundlerTransport: http(BUNDLER_URL),
      entryPoint: ENTRYPOINT_ADDRESS_V06,
      middleware: {
        sponsorUserOperation: async ({ userOperation }) => {
          return paymasterClient.sponsorUserOperation({
            userOperation,
            entryPoint: ENTRYPOINT_ADDRESS_V06,
            gasToken: gasTokenAddresses[CHAIN.id]["6TEST"],
          });
        },
      },
    });

    setIsKernelClientReady(true);
    setAccountAddress(kernelAccount.address);
  };

  const fetchTransferHistory = async (token: string) => {
    const fetchTransferHistoryResponse = await fetch(
      `${PASSKEY_SERVER_URL}/api/transfers?offset=0&limit=100`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const transferHistory = await fetchTransferHistoryResponse.json();
    console.log(transferHistory);
  };

  // Function to be called when "Register" is clicked
  const handleRegister = async () => {
    setIsRegistering(true);

    const { startRegistration, startAuthentication } = await import(
      "@simplewebauthn/browser"
    );
    const { key: webAuthnKey, result } = await toWebAuthnKey({
      passkeyName: username,
      passkeyServerUrl: PASSKEY_SERVER_URL,
      mode: WebAuthnMode.Register,
      signWithAuthenticator: startRegistration,
    });

    const passkeyValidator = await toPasskeyValidator(publicClient, {
      webAuthnKey,
      passkeyServerUrl: PASSKEY_SERVER_URL,
      entryPoint: ENTRYPOINT_ADDRESS_V06,
      signWithAuthenticator: startAuthentication,
    });

    await createAccountAndClient(passkeyValidator);

    setIsRegistering(false);
    setUserId(result.userId);
    setAccessToken(result.accessToken);
    window.alert("Register done.  Try sending UserOps.");
  };

  const handleLogin = async () => {
    await Moralis.start({
      apiKey: MORALIS_API_KEY,
      // ...and any other configuration
    });
    setIsLoggingIn(true);

    const { startAuthentication } = await import("@simplewebauthn/browser");
    const { key: webAuthnKey, result } = await toWebAuthnKey({
      passkeyName: username,
      passkeyServerUrl: PASSKEY_SERVER_URL,
      mode: WebAuthnMode.Login,
      signWithAuthenticator: startAuthentication,
    });

    const passkeyValidator = await toPasskeyValidator(publicClient, {
      webAuthnKey,
      passkeyServerUrl: PASSKEY_SERVER_URL,
      entryPoint: ENTRYPOINT_ADDRESS_V06,
      signWithAuthenticator: startAuthentication,
    });

    await createAccountAndClient(passkeyValidator);

    setIsLoggingIn(false);
    setUserId(result.userId);
    setAccessToken(result.accessToken);
    window.alert("Login done.  Try sending UserOps.");

    // const response = await Moralis.EvmApi.token.getWalletTokenTransfers({
    //   address: kernelAccount.address,
    //   chain: EvmChain.SEPOLIA,
    //   // fromDate,
    //   // fromBlock,
    //   // order: 'DESC',
    //   // toDate: ,
    //   // TODO: Specify supported stablecoin addresses for the given network
    //   contractAddresses: [stablecoinAddress],
    // });

    // console.warn(response.toJSON());

    await fetchTransferHistory(result.accessToken);
  };

  // Function to be called when "Login" is clicked
  const handleSendUserOp = async () => {
    if (!balanceFetched) {
      alert("Wait a bit until the balance is fetched...");
      return;
    }

    setIsSendingUserOp(true);
    setUserOpStatus("Sending UserOp...");

    const calls: Array<{ to: Hex; value: bigint; data: Hex }> = [];

    // const balance = await publicClient.readContract({
    //   address: stablecoinAddress,
    //   abi: ERC20_TOKEN_BALANCEOF_ABI,
    //   functionName: "balanceOf",
    //   args: [kernelAccount.address],
    // });

    if (balance < BigInt(1)) {
      calls.push({
        to: stablecoinAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: ERC20_TOKEN_MINT_ABI,
          args: [kernelAccount.address, BigInt(1000000000000)],
        }),
      });
    }

    const amountToTransfer = BigInt(1000000);

    // TODO: Approve only ceratin amount each time as a security measure
    const approveCall = await getERC20PaymasterApproveCall(
      paymasterClient as ZeroDevPaymasterClient<EntryPoint>,
      {
        gasToken: stablecoinAddress,
        approveAmount: BigInt(
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        ),
      }
    );
    const approveData = decodeFunctionData({
      abi: ERC20_TOKEN_APPROVE_ABI,
      data: approveCall.data,
    });

    const allowance = await publicClient.readContract({
      address: stablecoinAddress,
      abi: ERC20_TOKEN_ALLOWANCE_ABI,
      functionName: "allowance",
      args: [kernelAccount.address, approveData.args![0] as Hex],
    });
    if (
      (allowance as bigint) <
      BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      ) /
        BigInt(2)
    ) {
      calls.push(approveCall);
    }
    calls.push({
      to: stablecoinAddress,
      value: BigInt(0),
      data: encodeFunctionData({
        abi: ERC20_TOKEN_TRANSFER_ABI,
        args: [
          destinationAddress || "0x11176000cA328a2CbE62A92291Eb8d0154707b61",
          transferAmount ? transferAmount * 10 ** 6 : amountToTransfer,
        ],
        functionName: "transfer",
      }),
    });

    // TODO: Handle the occasional preVerificationGas error
    const userOpHash = await kernelClient.sendUserOperation({
      userOperation: {
        callData: await kernelAccount.encodeCallData(calls),
      },
    });

    setUserOpHash(userOpHash);

    const bundlerClient = kernelClient.extend(
      bundlerActions(ENTRYPOINT_ADDRESS_V06)
    );
    await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    // Update the message based on the count of UserOps
    const userOpMessage = `UserOp completed. <a href="https://jiffyscan.xyz/userOpHash/${userOpHash}?network=sepolia" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700">Click here to view.</a>`;

    setUserOpStatus(userOpMessage);
    setIsSendingUserOp(false);

    // const response = await Moralis.EvmApi.token.getWalletTokenTransfers({
    //   address: kernelAccount.address,
    //   chain: EvmChain.SEPOLIA,
    //   // fromDate,
    //   // fromBlock,
    //   // order: 'DESC',
    //   // toDate: ,
    //   // TODO: Specify supported stablecoin addresses for the given network
    //   contractAddresses: [stablecoinAddress],
    // });
    // console.warn(response.toJSON());

    await fetchTransferHistory(accessToken);
  };

  useEffect(() => {
    setMounted(true);
    //Implementing the setInterval method
    const interval = setInterval(async () => {
      if (!accountAddress) return;
      const result: GetBalanceReturnType = await getBalance(config, {
        address: accountAddress as Address,
        token: stablecoinAddress,
        chainId: sepolia.id,
      });
      setBalance(result.value);
      setBalanceDecimals(result.decimals);
      setBalanceFetched(true);
    }, 2000);

    //Clearing the interval
    return () => clearInterval(interval);
  }, [
    balanceFetched,
    balance,
    balanceDecimals,
    accountAddress,
    stablecoinAddress,
  ]);

  if (!mounted) return <></>;

  // Spinner component for visual feedback during loading states
  const Spinner = () => (
    <svg
      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );

  return (
    <main className="flex items-center justify-center min-h-screen px-4 py-24">
      <div className="w-full max-w-lg mx-auto">
        <h1 className="text-4xl font-semibold text-center mb-12">
          Payllet Passkeys Demo (Kernel/ZeroDev based)
        </h1>

        <div className="space-y-4">
          {/* Account Address Label */}
          {accountAddress && (
            <div className="text-center mb-4">
              Account address:{" "}
              <a
                href={`https://jiffyscan.xyz/account/${accountAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700"
              >
                {" "}
                {accountAddress}{" "}
              </a>
              {balanceFetched && (
                <div>
                  Account balance:{" "}
                  <div>{Number(balance) / 10 ** balanceDecimals}</div>
                </div>
              )}
            </div>
          )}

          {/* Input Box */}
          <input
            type="text"
            placeholder="Your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg w-full"
            style={{ color: "black" }}
          />

          {/* Input Box for destination address */}
          <input
            type="text"
            placeholder="Address to send tokens to"
            value={destinationAddress}
            onChange={(e) => setDestinationAddress(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg w-full"
            style={{ color: "black" }}
          />

          {/* Input Box for transfer amount */}
          <input
            type="number"
            placeholder="Transfer amount"
            value={transferAmount}
            onChange={(e) => setTransferAmount(parseInt(e.target.value))}
            className="p-2 border border-gray-300 rounded-lg w-full"
            style={{ color: "black" }}
          />

          {/* Register and Login Buttons */}
          <div className="flex flex-col sm:flex-row sm:space-x-4">
            {/* Register Button */}
            <button
              onClick={handleRegister}
              disabled={isRegistering || isLoggingIn}
              className="flex justify-center items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 w-full"
            >
              {isRegistering ? <Spinner /> : "Register"}
            </button>

            {/* Login Button */}
            <button
              onClick={handleLogin}
              disabled={isLoggingIn || isRegistering}
              className="mt-2 sm:mt-0 flex justify-center items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 w-full"
            >
              {isLoggingIn ? <Spinner /> : "Login"}
            </button>
          </div>

          {/* Send UserOp Button */}
          <div className="flex flex-col items-center w-full">
            <button
              onClick={handleSendUserOp}
              disabled={
                !isKernelClientReady || isSendingUserOp || !balanceFetched
              }
              className={`px-4 py-2 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50 flex justify-center items-center w-full ${
                isKernelClientReady && !isSendingUserOp
                  ? "bg-green-500 hover:bg-green-700 focus:ring-green-500"
                  : "bg-gray-500"
              }`}
            >
              {isSendingUserOp ? <Spinner /> : "Send UserOp"}
            </button>
            {/* UserOp Status Label */}
            {userOpHash && (
              <div
                className="mt-4"
                dangerouslySetInnerHTML={{
                  __html: userOpStatus,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
