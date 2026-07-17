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
RUN npm ci --omit=dev && npm cache clean --force

USER node
EXPOSE 3000
CMD ["node", "main.js"]
