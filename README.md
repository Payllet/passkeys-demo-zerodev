# Payllet account recovery

A single static page that finds funds stranded on older Payllet smart-account
addresses and moves them to the current one.

Each release of the account-abstraction library derives a different wallet
address from one and the same passkey, because the Kernel WebAuthn validator
address is folded into the CREATE2 salt. A user who registered on an older
client therefore owns funds at an address the current client never looks at.
`app/lib/config.ts` lists every generation that has shipped; adding a future one
is a single entry there.

Nothing here talks to the Payllet API. The passkey identifies itself through two
signatures, balances come from public RPC endpoints, and transfers go straight to
a bundler, so the page still works while the backend is down.

## Build-time configuration

All optional. Without any of them the page reads addresses and balances over
public RPC endpoints, and asks for a bundler URL before it moves anything.

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_RP_ID` | Domain the passkeys were registered under. Defaults to the domain serving the page. |
| `NEXT_PUBLIC_PIMLICO_URL` | Bundler base URL, e.g. `https://api.pimlico.io/v2/`. |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | Bundler API key. |
| `NEXT_PUBLIC_PIMLICO_POLICY_ID` | Sponsorship policy, so the sweep costs the user no gas. |
| `NEXT_PUBLIC_ANKR_API_KEY` | Private RPC endpoints instead of the public ones. |

Next inlines these at build time, so they have to be present when `next build`
runs, not when the page is served.

## Domain

A passkey is readable only from the domain it was registered against. Served
from anywhere else, the page loads but finds no credentials. For Payllet's own
users that domain is `signin.payllet.io`, so a deployment meant for them has to
be served from it or a subdomain of it, with `NEXT_PUBLIC_RP_ID` set to match.
Anywhere else the page works against passkeys registered on that same host.

## Develop

```
npm install
npm run dev     # http://localhost:3001
npm run build   # static export into out/
```
