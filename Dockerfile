FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Next inlines these into the bundle, so they have to be present now; setting
# them on the running container has no effect.
ARG NEXT_PUBLIC_RP_ID
ARG NEXT_PUBLIC_PIMLICO_URL
ARG NEXT_PUBLIC_PIMLICO_API_KEY
ARG NEXT_PUBLIC_PIMLICO_POLICY_ID
ARG NEXT_PUBLIC_ANKR_API_KEY
ARG NEXT_PUBLIC_FALLBACK_URL
ENV NEXT_PUBLIC_RP_ID=$NEXT_PUBLIC_RP_ID \
    NEXT_PUBLIC_PIMLICO_URL=$NEXT_PUBLIC_PIMLICO_URL \
    NEXT_PUBLIC_PIMLICO_API_KEY=$NEXT_PUBLIC_PIMLICO_API_KEY \
    NEXT_PUBLIC_PIMLICO_POLICY_ID=$NEXT_PUBLIC_PIMLICO_POLICY_ID \
    NEXT_PUBLIC_ANKR_API_KEY=$NEXT_PUBLIC_ANKR_API_KEY \
    NEXT_PUBLIC_FALLBACK_URL=$NEXT_PUBLIC_FALLBACK_URL

RUN npm run build


FROM node:22-alpine

WORKDIR /app

# `serve` is installed rather than fetched on demand so that a start command
# written as `npx serve out` resolves it offline, and it reads the port to bind
# from PORT on its own.
RUN npm install -g serve@14.2.4

COPY --from=build /app/out ./out

ENV PORT=8080
EXPOSE 8080

CMD ["serve", "out"]
