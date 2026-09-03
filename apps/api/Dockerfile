# Build from the workspace root:
#   docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS build
ENV NX_DAEMON=false
WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Webpack emits main.js plus a pruned package.json/package-lock.json
# (generatePackageJson) and copies the drizzle migrations as assets.
RUN npx nx build api

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /workspace/dist/apps/api ./
# --legacy-peer-deps because @nestjs/throttler still declares a peer range that
# stops at Nest 11 (it runs on 12; the root package.json overrides the range).
# Nx's lockfile pruning keeps only string-valued overrides, so the nested one
# that fixes it does not survive into the manifest copied here — while the
# pruned lockfile *was* resolved with it. The tree is therefore already the one
# npm chose at the workspace root; this only stops the peer check from
# re-litigating it. Drop the flag when throttler supports Nest 12.
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# The media store writes here (MEDIA_ROOT=/media in compose). Creating it owned
# by node means the named volume mounted here inherits that ownership, so the
# unprivileged runtime user can write uploads.
RUN mkdir -p /media && chown node:node /media

USER node
EXPOSE 3000
CMD ["node", "main.js"]
