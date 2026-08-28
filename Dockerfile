FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w studio-admin && npm run build -w @lp/dapp
ENV NODE_ENV=production
# command per service di docker-compose.yml
CMD ["node_modules/next/dist/bin/next", "start", "-p", "3015"]
