import { openDb } from '../../core/db.ts'
import { hashPassword } from '../../core/crypto.ts'
import { log } from '../../core/util.ts'

/**
 * Kelola user login dashboard (multi-user + role).
 *   user add <username> <password> [admin|viewer]   (default: viewer)
 *   user list
 *   user remove <username>
 * role admin: boleh pause bot & kelola wallet. viewer: read-only.
 * Password di-hash scrypt; plaintext tidak pernah disimpan.
 */
export async function run(args: string[]) {
  const [cmd, username, password, roleArg] = args
  const db = openDb()

  if (cmd === 'add') {
    if (!username || !password) throw new Error('usage: user add <username> <password> [admin|viewer]')
    const role = roleArg === 'admin' ? 'admin' : 'viewer'
    db.prepare(
      `INSERT INTO users (username, pass_hash, role, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET pass_hash = excluded.pass_hash, role = excluded.role`,
    ).run(username, hashPassword(password), role, Math.floor(Date.now() / 1000))
    log(`user '${username}' disimpan (role=${role}, password di-hash)`)
    return
  }
  if (cmd === 'remove') {
    if (!username) throw new Error('usage: user remove <username>')
    const r = db.prepare('DELETE FROM users WHERE username = ?').run(username)
    log(`user '${username}' dihapus (${r.changes} baris)`)
    return
  }
  if (cmd === 'list' || !cmd) {
    const rows = db.prepare('SELECT username, role, created_at FROM users ORDER BY username').all() as {
      username: string
      role: string
      created_at: number
    }[]
    if (rows.length === 0) {
      log('belum ada user — buat: user add <username> <password> [admin|viewer]')
      return
    }
    for (const r of rows)
      console.log(`${r.username}\t[${r.role}]\t(dibuat ${new Date(r.created_at * 1000).toISOString()})`)
    return
  }
  throw new Error(`perintah tidak dikenal: ${cmd} (add|list|remove)`)
}
