# Build from the workspace root:
#   docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS build
ENV NX_DAEMON=false
WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx nx build web

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

# The Angular SSR bundle is self-contained (esbuild bundles all deps) and
# serves the browser assets from ../browser itself — no npm install needed.
COPY --from=build /workspace/dist/apps/web ./

USER node
EXPOSE 4000
CMD ["node", "server/server.mjs"]
