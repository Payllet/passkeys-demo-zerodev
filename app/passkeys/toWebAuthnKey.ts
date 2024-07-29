import { type Hex, keccak256 } from "viem";
import { b64ToBytes, uint8ArrayToHexString } from "./utils";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/typescript-types";

export enum WebAuthnMode {
  Register = "register",
  Login = "login",
}

export type WebAuthnKey = {
  pubX: bigint;
  pubY: bigint;
  credId: string;
  authenticatorIdHash: Hex;
};

export type WebAuthnAccountParams = {
  passkeyName: string;
  passkeyServerUrl: string;
  webAuthnKey?: WebAuthnKey;
} & (
  | {
      mode: WebAuthnMode.Register;
      signWithAuthenticator: (
        options: any
      ) => Promise<RegistrationResponseJSON>;
    }
  | {
      mode: WebAuthnMode.Login;
      signWithAuthenticator: (
        options: any
      ) => Promise<AuthenticationResponseJSON>;
    }
);

export const loginOrRegisterWithWebAuthn = async ({
  passkeyName,
  passkeyServerUrl,
  mode,
  signWithAuthenticator,
}: WebAuthnAccountParams): Promise<{ publicKeyX: Hex; publicKeyY: Hex; credId: string; }> => {
  let publicKeyX: Hex | undefined;
  let publicKeyY: Hex | undefined;
  let credId: string | undefined;

  if (mode === WebAuthnMode.Login) {
    // Get login options
    const loginOptionsResponse = await fetch(`${passkeyServerUrl}/api/auth/start`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
    });
    const loginOptions = await loginOptionsResponse.json();

    // Start authentication (login)
    // const { startAuthentication } = await import("@simplewebauthn/browser");
    const loginCred = await signWithAuthenticator(loginOptions.options);

    credId = loginCred.id;

    // Verify authentication
    const loginVerifyResponse = await fetch(`${passkeyServerUrl}/api/auth/complete`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId: loginOptions.requestId, authenticationResponse: loginCred }),
  });

    const loginVerifyResult = await loginVerifyResponse.json();
    console.log(loginVerifyResult)

    if (!loginVerifyResult || !loginVerifyResult.accessToken) {
      throw new Error("Login not verified");
    }
    // Import the key
    publicKeyX = loginVerifyResult.publicKeyX;
    publicKeyY = loginVerifyResult.publicKeyY;
  } else {
    // Get registration options
    const registerOptionsResponse = await fetch(`${passkeyServerUrl}/api/users/register/start`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: passkeyName }),
    })
    const registerOptions = await registerOptionsResponse.json();

    // Start registration
    // const { startRegistration } = await import("@simplewebauthn/browser");
    const registerCred = await signWithAuthenticator(registerOptions.options);

    credId = registerCred.id;

    // Verify registration
    const registerVerifyResponse = await fetch(`${passkeyServerUrl}/api/users/register/complete`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
      },
      body: JSON.stringify({ registrationResponse: registerCred, requestId: registerOptions.requestId }),
    });

    const registerVerifyResult = await registerVerifyResponse.json();
    if (!registerVerifyResult.verified) {
      throw new Error("Registration not verified");
    }

    // Import the key
    publicKeyX = registerVerifyResult.publicKeyX;
    publicKeyY = registerVerifyResult.publicKeyY;
  }

  if (!publicKeyX || !publicKeyY) {
    throw new Error("No public key returned from registration credential");
  }
  if (!credId) {
    throw new Error("No credential id returned from registration credential");
  }
  return { publicKeyX, publicKeyY, credId };
}

export const toWebAuthnKeyDetails = async ({ pubKey, credId }: { pubKey: string; credId: string }): Promise<WebAuthnKey> => {
  const authenticatorIdHash = keccak256(
    uint8ArrayToHexString(b64ToBytes(credId))
  );
  const spkiDer = Buffer.from(pubKey, "base64");
  const key = await crypto.subtle.importKey(
    "spki",
    spkiDer,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["verify"]
  );

  // Export the key to the raw format
  const rawKey = await crypto.subtle.exportKey("raw", key);
  const rawKeyBuffer = Buffer.from(rawKey);

  // The first byte is 0x04 (uncompressed), followed by x and y coordinates (32 bytes each for P-256)
  const pubKeyX = rawKeyBuffer.subarray(1, 33).toString("hex");
  const pubKeyY = rawKeyBuffer.subarray(33).toString("hex");
  console.log(pubKeyX, pubKeyY);

  return {
    pubX: BigInt(`0x${pubKeyX}`),
    pubY: BigInt(`0x${pubKeyY}`),
    credId,
    authenticatorIdHash,
  };
};

export const toWebAuthnKey = async ({
  passkeyName,
  passkeyServerUrl,
  webAuthnKey,
  mode,
  signWithAuthenticator,
}: WebAuthnAccountParams): Promise<WebAuthnKey> => {
  if (webAuthnKey) {
    return webAuthnKey;
  }
  if (mode === WebAuthnMode.Login) {
    const { publicKeyX, publicKeyY, credId } = await loginOrRegisterWithWebAuthn({
      passkeyName,
      passkeyServerUrl,
      mode,
      signWithAuthenticator,
    });
    return {
      pubX: BigInt(publicKeyX),
      pubY: BigInt(publicKeyY),
      credId,
      authenticatorIdHash: keccak256(
        uint8ArrayToHexString(b64ToBytes(credId))
      ),
    };
  } else {
    const { publicKeyX, publicKeyY, credId } = await loginOrRegisterWithWebAuthn({
      passkeyName,
      passkeyServerUrl,
      mode,
      signWithAuthenticator,
    });
    return {
      pubX: BigInt(publicKeyX),
      pubY: BigInt(publicKeyY),
      credId,
      authenticatorIdHash: keccak256(
        uint8ArrayToHexString(b64ToBytes(credId))
      ),
    };
  }
};