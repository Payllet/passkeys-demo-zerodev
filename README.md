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
the keyless endpoints listed per chain in `app/lib/config.ts`, and asks for a
bundler URL before it moves anything. Each chain carries more than one, because
addresses are derived against the first chain in that list and a single
unreachable endpoint there would otherwise leave the whole page empty.

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_RP_ID` | Domain the passkeys were registered under. Defaults to the domain serving the page. |
| `NEXT_PUBLIC_PIMLICO_URL` | Bundler base URL, e.g. `https://api.pimlico.io/v2/`. |
| `NEXT_PUBLIC_PIMLICO_API_KEY` | Bundler API key. |
| `NEXT_PUBLIC_PIMLICO_POLICY_ID` | Sponsorship policy, so the sweep costs the user no gas. |
| `NEXT_PUBLIC_ANKR_API_KEY` | Puts keyed Ankr endpoints ahead of the keyless ones each chain already carries. |
| `NEXT_PUBLIC_FALLBACK_URL` | A URL for this page on a host under the relying party, offered when the browser refuses the relying party. |

Next inlines these at build time, so they have to be present when `next build`
runs, not when the page is served.

## Domain

A passkey is readable only from the domain it was registered against, and a
relying party ID has to be the serving host or a parent of it. For Payllet's own
users that ID is `signin.payllet.io`, so a deployment meant for them has to be
served from it or a subdomain of it, with `NEXT_PUBLIC_RP_ID` set to match.
Anywhere else the page works against passkeys registered on that same host.

The Payllet deployment answers on two hostnames.
`recovery.signin.payllet.io` sits under the relying party and needs nothing from
the browser beyond the ordinary rule. `recovery.payllet.io` is a sibling rather
than a subdomain, and reaches the same passkeys through related origin requests:
the browser fetches `https://signin.payllet.io/.well-known/webauthn`, finds the
origin listed, and allows the ceremony. Chrome and Edge implement this from 128,
Safari from 18 and Firefox from 152; an older client finds no passkey there and
is sent to the first hostname, which is why both stay served.

The relying party ID is not part of the account address: it selects which
passkey signs, and the address comes from the public key, the credential ID
hash and the validator alone. A deployment that reads the right passkey from a
different host therefore derives the same addresses.

## Deploy

The image is a two-stage build: Node produces the static export, then `serve`
hands it out on `$PORT`. Build arguments carry the `NEXT_PUBLIC_*` values, since
the bundle is written during the build. `serve` is installed into the runtime
image rather than fetched on demand, so a host that overrides the start command
with `npx serve out` resolves it without reaching the network.

```
docker build -t payllet-recovery \
  --build-arg NEXT_PUBLIC_PIMLICO_URL=https://api.pimlico.io/v2/ \
  --build-arg NEXT_PUBLIC_PIMLICO_API_KEY=... .
docker run -p 8080:8080 -e PORT=8080 payllet-recovery
```

## Develop

```
npm install
npm run dev     # http://localhost:3001
npm run build   # static export into out/
```
