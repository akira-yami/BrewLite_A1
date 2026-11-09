# syntax=docker/dockerfile:1.7

FROM node:24.21.0-alpine3.23 AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static

USER node
EXPOSE 3000

CMD ["node", "server.js"]
