// file: apps/api/src/platform/testKeys.ts
/**
 * Key helpers for tests only: make throwaway RSA keys and write them as the PEM text the settings hold.
 * Nothing here is used by the running Worker. The keys exist for the length of one test run and are not
 * the real keys.
 */
import { toBase64 } from './crypto.ts'

function pem(label: string, der: ArrayBuffer): string {
  const body = toBase64(der).replace(/(.{64})/g, '$1\n')
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`
}

/** A signing key pair (RS256) as PKCS#8 and SPKI PEM text. */
export async function makeSigningKeyPem() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  return {
    privatePem: pem('PRIVATE KEY', (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer),
    publicPem: pem('PUBLIC KEY', (await crypto.subtle.exportKey('spki', pair.publicKey)) as ArrayBuffer),
    pair,
  }
}

/** A sealing key pair (RSA-OAEP, SHA-256) as PKCS#8 and SPKI PEM text. */
export async function makeSealingKeyPem() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'])) as CryptoKeyPair
  return {
    privatePem: pem('PRIVATE KEY', (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer),
    publicPem: pem('PUBLIC KEY', (await crypto.subtle.exportKey('spki', pair.publicKey)) as ArrayBuffer),
    pair,
  }
}
