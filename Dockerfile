FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
RUN pnpm install
COPY . .
RUN pnpm run build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PORT=3099
ENV NINESCOUT_DATA_DIR=/app/data
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
EXPOSE 3099
CMD ["node", "dist-server/server/cli.js", "--host", "0.0.0.0", "--no-open"]
