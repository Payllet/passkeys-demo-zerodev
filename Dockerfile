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
ENV NEXT_PUBLIC_RP_ID=$NEXT_PUBLIC_RP_ID \
    NEXT_PUBLIC_PIMLICO_URL=$NEXT_PUBLIC_PIMLICO_URL \
    NEXT_PUBLIC_PIMLICO_API_KEY=$NEXT_PUBLIC_PIMLICO_API_KEY \
    NEXT_PUBLIC_PIMLICO_POLICY_ID=$NEXT_PUBLIC_PIMLICO_POLICY_ID \
    NEXT_PUBLIC_ANKR_API_KEY=$NEXT_PUBLIC_ANKR_API_KEY

RUN npm run build


FROM nginx:1.27-alpine

COPY --from=build /app/out /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV PORT=8080
EXPOSE 8080
