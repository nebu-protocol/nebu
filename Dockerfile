FROM node:22-slim
WORKDIR /app
COPY . .
# root: workspace apps/bot + packages (tsx untuk collector)
RUN npm ci
# backoffice & dapp: project npm mandiri dengan lockfile sendiri
RUN cd apps/backoffice && npm ci && npm run build
RUN cd apps/dapp && npm ci && npm run build
ENV NODE_ENV=production
# command per service di docker-compose.yml
CMD ["node", "--version"]
