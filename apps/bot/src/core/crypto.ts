import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Enkripsi private key at-rest: AES-256-GCM, key diturunkan scrypt dari
 * LPBOT_KEY_SECRET (di .env root). Format payload: v1:<ivB64>:<tagB64>:<ctB64>.
 * Backoffice memakai format identik (apps/backoffice/src/server/lpbot-crypto.ts)
 * — ada test lintas-format di test/crypto.test.ts, jaga keduanya sinkron.
 */
const SALT = 'lpbot-wallet-v1'

const deriveKey = (secret: string) => scryptSync(secret, SALT, 32)

export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`
}

export function decryptSecret(payload: string, secret: string): string {
  const [v, ivB, tagB, ctB] = payload.split(':')
  if (v !== 'v1' || !ivB || !tagB || !ctB) throw new Error('format enc_pk tidak dikenal')
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(ivB, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString(
    'utf8',
  )
}

/**
 * Hash password login (scrypt). Format: s1:<saltHex>:<hashHex>.
 * Dipakai bot (buat user) & backoffice (verifikasi login) — jaga format sinkron.
 */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16)
  return `s1:${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}`
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [v, saltHex, hashHex] = stored.split(':')
  if (v !== 's1' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(pw, Buffer.from(saltHex, 'hex'), 32)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
