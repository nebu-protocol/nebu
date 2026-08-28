# pin ke versi node host (v22.23.2) supaya node:sqlite jalan tanpa flag
FROM node:22.23.2-slim
WORKDIR /app
COPY . .
# root: workspace apps/bot + packages (tsx untuk collector)
RUN npm ci
# backoffice: project npm mandiri
RUN cd apps/backoffice && npm ci && npm run build
# dapp: NEXT_PUBLIC_* di-inline saat build (nilai publik: alamat kontrak + chain)
ARG NEXT_PUBLIC_LP_VAULT_FACTORY
ARG NEXT_PUBLIC_CHAIN
RUN cd apps/dapp && npm ci && \
    NEXT_PUBLIC_LP_VAULT_FACTORY=$NEXT_PUBLIC_LP_VAULT_FACTORY \
    NEXT_PUBLIC_CHAIN=$NEXT_PUBLIC_CHAIN \
    npm run build
ENV NODE_ENV=production
# command per service di docker-compose.yml
CMD ["node", "--version"]
