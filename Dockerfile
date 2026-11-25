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
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
EXPOSE 3099
CMD ["pnpm", "run", "start"]
