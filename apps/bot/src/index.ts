export {}

const commands: Record<string, () => Promise<{ run: (args: string[]) => Promise<void> }>> = {
  backfill: () => import('./modules/scanner/backfill.ts'),
  activity: () => import('./modules/scanner/activity.ts'),
  snapshot: () => import('./modules/scanner/snapshot.ts'),
  collect: () => import('./modules/scanner/collect.ts'),
  rank: () => import('./modules/report/rank.ts'),
  yield: () => import('./modules/report/yield.ts'),
  pnl: () => import('./modules/report/pnl.ts'),
  'positions-live': () => import('./modules/report/positions-live.ts'),
  'edge-check': () => import('./modules/report/edge-check.ts'),
  'ledger-sync': () => import('./modules/report/ledger-sync.ts'),
  'exit-manager': () => import('./modules/strategy/exit-manager.ts'),
  price: () => import('./modules/price/ethusd.ts'),
  plan: () => import('./modules/strategy/plan.ts'),
  execute: () => import('./modules/executor/executor.ts'),
  withdraw: () => import('./modules/wallet/withdraw.ts'),
  close: () => import('./modules/wallet/close.ts'),
  user: () => import('./modules/auth/users.ts'),
}

const [cmd, ...args] = process.argv.slice(2)
const load = cmd ? commands[cmd] : undefined
if (!load) {
  console.error(`usage: <${Object.keys(commands).join('|')}> [args]`)
  process.exit(1)
}
const mod = await load()
await mod.run(args)
