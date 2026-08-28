// pm2 config. Deploy: pm2 start ecosystem.config.cjs && pm2 save
// Node 22 dipaksa oleh wrapper deploy/run-*.sh (sistem Node 20 tak punya node:sqlite).
const path = require("node:path");
const REPO = __dirname;
const DB = path.join(REPO, "data", "lp.db");

module.exports = {
  apps: [
    {
      name: "lp-web", // backoffice (CRUD/manage) -> bo-nebu.ifajar.dev
      script: "deploy/run-web.sh",
      interpreter: "bash",
      cwd: REPO,
      env: { PORT: "3015", LPBOT_DB_PATH: DB },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "lp-dapp", // dapp publik (LP) -> nebu.ifajar.dev
      script: "deploy/run-dapp.sh",
      interpreter: "bash",
      cwd: REPO,
      env: { PORT: "3016", LPBOT_DB_PATH: DB },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "lp-collector",
      script: "deploy/run-collector.sh",
      interpreter: "bash",
      cwd: REPO,
      env: { DB_PATH: DB },
      autorestart: true,
      min_uptime: "60s",
      max_restarts: 10,
    },
  ],
};
