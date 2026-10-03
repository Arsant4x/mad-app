import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { gcmDecipher } from './gcm.util';

/**
 * Encryption at rest for stored credentials (CLAUDE.md §10: sensitive fields
 * are encrypted, not stored in the clear).
 *
 * AES-256-GCM, so the ciphertext is authenticated — a tampered value fails to
 * decrypt rather than silently yielding garbage that then gets sent somewhere
 * as a bearer token.
 *
 * The key comes from `SECRETS_ENCRYPTION_KEY`. It is deliberately **not**
 * defaulted: a hardcoded fallback key is the same as no encryption, and would
 * be far more dangerous than the obvious failure of a missing variable,
 * because it would look encrypted.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM's standard nonce size
const FORMAT_VERSION = 'v1';

function key(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY must be set to at least 32 characters before storing any secret');
  }
  // Hashed to exactly 32 bytes so an operator can use a human-typed
  // passphrase without it silently truncating to the wrong key length.
  return createHash('sha256').update(raw).digest();
}

/** `v1:<iv>:<authTag>:<ciphertext>`, all base64. Versioned so the format can
 * change later without having to guess how an old row was written. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [FORMAT_VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(':');
  if (version !== FORMAT_VERSION) throw new Error(`Unsupported secret format "${version}"`);

  // ⚖️ الوسمُ بطوله الكامل وحدَه (`ق-١٥٨٦`) — المدخلُ الواحد يرفض المقصوص.
  const decipher = gcmDecipher(key(), Buffer.from(ivB64, 'base64'), Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** What a client is allowed to see about a stored secret: whether one exists,
 * never any part of its value. */
export function secretIsSet(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.length > 0;
}
