import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

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
