#!/usr/bin/env node
/**
 * @fileoverview KR Legal — Worker Key Setup Script
 * @path apps/shared/d1-workers/util/setup-worker-keys.mjs
 *
 * Interactive menu-driven script that generates an RS256 key pair,
 * shows the user exactly where files will be written, lets them
 * customize the key basename, then generates, prints .env values,
 * and uploads the public key to Cloudflare KV.
 *
 * Usage (from project root):
 *   node apps/shared/d1-workers/util/setup-worker-keys.mjs
 *
 * Key file locations:
 *   Active keys : /private/dev-private-keys/
 *   New keys    : /private/dev-private-keys/newkeys/   ← always writes here
 *
 * SECURITY:
 *   - /private/ is git-ignored automatically
 *   - Never commit .pem files or JWT_PRIVATE_KEY
 *   - In production move JWT_PRIVATE_KEY to a secrets manager
 */

import { generateKeyPairSync }                    from 'crypto'
import { writeFileSync, mkdirSync, existsSync,
         readFileSync, readdirSync }               from 'fs'
import { execSync }                                from 'child_process'
import { join, dirname }                           from 'path'
import { fileURLToPath }                           from 'url'
import * as readline                               from 'readline'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..', '..', '..')         // project root
const KEYS_BASE = join(ROOT, 'private', 'dev-private-keys') // active keys
const KEYS_DIR  = join(KEYS_BASE, 'newkeys')                // new keys always go here

// ---------------------------------------------------------------------------
// Console helpers
// ---------------------------------------------------------------------------
const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  cyan   : '\x1b[36m',
  red    : '\x1b[31m',
  white  : '\x1b[37m',
  bgBlue : '\x1b[44m',
}

function log(msg)    { console.log(`${C.green}✓${C.reset} ${msg}`) }
function info(msg)   { console.log(`${C.cyan}ℹ${C.reset} ${msg}`) }
function warn(msg)   { console.log(`${C.yellow}⚠${C.reset} ${msg}`) }
function err(msg)    { console.log(`${C.red}✗${C.reset} ${msg}`) }
function blank()     { console.log() }
function div()       { console.log(`${C.dim}${'─'.repeat(62)}${C.reset}`) }

function banner(title) {
  blank()
  console.log(`${C.bgBlue}${C.bold}  ${title.padEnd(60)}${C.reset}`)
  div()
}

function label(key, val) {
  console.log(`  ${C.dim}${key.padEnd(22)}${C.reset}${C.white}${val}${C.reset}`)
}

/** Strip PEM headers/newlines → single base64 string */
function stripPem(pem) {
  return pem.split('\n')
    .filter(l => !l.startsWith('-----') && l.trim() !== '')
    .join('')
}

/** Ensure /private/ is in .gitignore */
function ensureGitIgnore() {
  const giPath = join(ROOT, '.gitignore')
  const entry  = 'private/'
  if (!existsSync(giPath)) {
    warn('.gitignore not found — skipping gitignore update')
    return
  }
  const content = readFileSync(giPath, 'utf8')
  if (!content.includes(entry)) {
    writeFileSync(giPath, content + `\n# Private keys — never commit\n${entry}\n`)
    log(`Added ${entry} to .gitignore`)
  }
}

/** List existing .pem files in a directory (short display) */
function listPems(dir) {
  if (!existsSync(dir)) return '(directory does not exist yet)'
  const files = readdirSync(dir).filter(f => f.endsWith('.pem'))
  return files.length ? files.join('  ') : '(empty)'
}

/** Read KV namespace IDs from wrangler.json */
function readWranglerKv() {
  const wranglerPath = join(ROOT, 'wrangler.json')
  if (!existsSync(wranglerPath)) return { kvNamespaceId: null, previewId: null }
  try {
    const cfg       = JSON.parse(readFileSync(wranglerPath, 'utf8'))
    const kvBinding = cfg.kv_namespaces?.find(ns => ns.binding === 'KR_KEYS')
    return {
      kvNamespaceId : kvBinding?.id        ?? null,
      previewId     : kvBinding?.preview_id ?? null,
    }
  } catch { return { kvNamespaceId: null, previewId: null } }
}

/** Check wrangler availability */
function wranglerVersion() {
  try { return execSync('wrangler --version', { encoding: 'utf8' }).trim() }
  catch { return null }
}

// ---------------------------------------------------------------------------
// Readline promise wrappers
// ---------------------------------------------------------------------------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function ask(question) {
  return new Promise(resolve => rl.question(`${C.cyan}?${C.reset} ${question} `, resolve))
}

function askMenu(question, options) {
  return new Promise(resolve => {
    console.log(`${C.cyan}?${C.reset} ${question}`)
    options.forEach((opt, i) => {
      console.log(`  ${C.bold}${i + 1}${C.reset}. ${opt}`)
    })
    blank()
    rl.question(`  Enter choice [1-${options.length}]: `, answer => {
      const n = parseInt(answer.trim(), 10)
      resolve(isNaN(n) || n < 1 || n > options.length ? null : n - 1)
    })
  })
}

// ---------------------------------------------------------------------------
// Main — async so we can await readline
// ---------------------------------------------------------------------------
async function main() {

  // ── Welcome banner ────────────────────────────────────────────────────────
  banner('KR Legal  —  Worker Key Setup')
  console.log(`  Generates an RS256 key pair for JWT signing between`)
  console.log(`  the Next.js server (signs) and Cloudflare Workers (verifies).`)
  blank()
  console.log(`  ${C.bold}Key locations:${C.reset}`)
  label('Active keys dir',  `private/dev-private-keys/`)
  label('New keys dir',     `private/dev-private-keys/newkeys/  ← writes here`)
  blank()
  console.log(`  ${C.bold}Current contents:${C.reset}`)
  label('Active keys',      listPems(KEYS_BASE))
  label('Staged (newkeys)', listPems(KEYS_DIR))
  blank()

  const wVer      = wranglerVersion()
  const { kvNamespaceId, previewId } = readWranglerKv()
  const kvReady   = kvNamespaceId && !kvNamespaceId.startsWith('REPLACE_WITH')

  console.log(`  ${C.bold}Environment:${C.reset}`)
  label('Node version',     process.version)
  label('wrangler',         wVer ?? `${C.red}not found${C.reset}`)
  label('KR_KEYS namespace',kvReady
    ? `${C.green}${kvNamespaceId}${C.reset}`
    : `${C.red}not configured in wrangler.json${C.reset}`)
  label('KV preview ns',    previewId && !previewId.startsWith('REPLACE_WITH')
    ? `${C.green}${previewId}${C.reset}`
    : `${C.dim}not set${C.reset}`)
  div()

  // ── Main menu ─────────────────────────────────────────────────────────────
  const choice = await askMenu('What would you like to do?', [
    'Generate new key pair  (writes to newkeys/)',
    'Upload existing newkeys/public key to Cloudflare KV only',
    'Show current configuration and exit',
    'Exit without changes',
  ])

  if (choice === null || choice === 3) {
    blank(); info('Exiting — no changes made.'); rl.close(); return
  }

  if (choice === 2) {
    await uploadOnly({ kvNamespaceId, previewId, kvReady, wVer })
    rl.close(); return
  }

  if (choice === 1) {
    await uploadOnly({ kvNamespaceId, previewId, kvReady, wVer, fromNewkeys: true })
    rl.close(); return
  }

  // ── choice === 0 : Generate new key pair ──────────────────────────────────
  await generateFlow({ kvNamespaceId, previewId, kvReady, wVer })
  rl.close()
}

// ---------------------------------------------------------------------------
// Generate flow
// ---------------------------------------------------------------------------
async function generateFlow({ kvNamespaceId, previewId, kvReady, wVer }) {

  // ── Basename selection ────────────────────────────────────────────────────
  banner('Step 1 of 3  —  Key Basename')
  console.log(`  Files will be named:`)
  console.log(`    ${C.white}<basename>-private.pem${C.reset}  (private key — never share)`)
  console.log(`    ${C.white}<basename>-public.pem${C.reset}   (public key  — uploaded to KV)`)
  blank()
  console.log(`  Default basename: ${C.bold}kr-worker${C.reset}`)
  blank()

  const basenameInput = await ask('Enter basename (or press Enter to use "kr-worker"):')
  const basename = basenameInput.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'kr-worker'

  if (basenameInput.trim() && basename !== basenameInput.trim()) {
    warn(`Basename sanitised to "${basename}" (alphanumeric, hyphens, underscores only)`)
  }

  const privFilename = `${basename}-private.pem`
  const pubFilename  = `${basename}-public.pem`
  const PRIV_PATH    = join(KEYS_DIR, privFilename)
  const PUB_PATH     = join(KEYS_DIR, pubFilename)

  blank()
  console.log(`  ${C.bold}Will write:${C.reset}`)
  label('Private key', `private/dev-private-keys/newkeys/${privFilename}`)
  label('Public key',  `private/dev-private-keys/newkeys/${pubFilename}`)
  blank()

  // Overwrite guard
  if (existsSync(PRIV_PATH)) {
    warn(`${privFilename} already exists in newkeys/`)
    const overwrite = await ask('Overwrite? (yes / no):')
    if (overwrite.trim().toLowerCase() !== 'yes') {
      blank(); info('Aborted — no files changed.'); return
    }
  }

  const confirm = await ask(`Confirm: generate "${basename}" key pair? (yes / no):`)
  if (confirm.trim().toLowerCase() !== 'yes') {
    blank(); info('Aborted — no files changed.'); return
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  banner('Step 2 of 3  —  Generating Key Pair')

  mkdirSync(KEYS_DIR, { recursive: true })
  ensureGitIgnore()

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength        : 2048,
    publicKeyEncoding    : { type: 'spki',  format: 'pem' },
    privateKeyEncoding   : { type: 'pkcs8', format: 'pem' },
  })

  writeFileSync(PRIV_PATH, privateKey, { mode: 0o600 })
  writeFileSync(PUB_PATH,  publicKey)
  log(`Generated  newkeys/${privFilename}  (chmod 600)`)
  log(`Generated  newkeys/${pubFilename}`)

  // ── .env output ───────────────────────────────────────────────────────────
  const privateB64 = stripPem(privateKey)
  const keyId      = process.env.JWT_KEY_ID ?? 'kr-web-dev-dan'

  blank()
  console.log(`  ${C.bold}Add these lines to your .env file:${C.reset}`)
  blank()
  console.log(`${C.yellow}JWT_PRIVATE_KEY=${privateB64}${C.reset}`)
  console.log(`${C.yellow}JWT_KEY_ID=${keyId}${C.reset}`)
  blank()
  warn('Keep JWT_PRIVATE_KEY private. Never commit it.')

  // ── KV Upload ─────────────────────────────────────────────────────────────
  banner('Step 3 of 3  —  Upload Public Key to Cloudflare KV')

  const doUpload = await ask('Upload public key to Cloudflare KV now? (yes / no):')
  if (doUpload.trim().toLowerCase() === 'yes') {
    await runKvUpload({
      pubPem        : publicKey,
      keyId,
      kvNamespaceId,
      previewId,
      kvReady,
      wVer,
      pubFilename,
    })
  } else {
    blank()
    info('Skipped KV upload. Run this script again and choose option 2 when ready.')
    printManualKvCommand(pubFilename, keyId)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  banner('Done')
  log(`${privFilename}  →  private/dev-private-keys/newkeys/  (git-ignored)`)
  log(`${pubFilename}   →  private/dev-private-keys/newkeys/`)
  blank()
  warn('New keys are staged in newkeys/ — NOT active yet.')
  info(`To activate: copy both .pem files from newkeys/ up to dev-private-keys/`)
  info('Then update .env and restart your workers.')
  blank()
  info('Next steps after promoting keys:')
  console.log('  1. Paste JWT_PRIVATE_KEY + JWT_KEY_ID into .env')
  console.log('  2. wrangler dev apps/shared/d1-workers/identity-worker/worker.ts --port 8788')
  console.log('  3. wrangler dev apps/shared/d1-workers/admin-worker/worker.ts    --port 8789')
  console.log('  4. pnpm run dev')
  console.log('  5. http://localhost:3000/api/worker-d1-testing-dan')
  blank()
}

// ---------------------------------------------------------------------------
// Upload-only flow (option 2 — re-upload existing newkeys/ public key)
// ---------------------------------------------------------------------------
async function uploadOnly({ kvNamespaceId, previewId, kvReady, wVer }) {
  banner('Upload Public Key to Cloudflare KV')

  const pems = existsSync(KEYS_DIR)
    ? readdirSync(KEYS_DIR).filter(f => f.endsWith('-public.pem') || f === 'public.pem')
    : []

  if (pems.length === 0) {
    err('No public .pem files found in private/dev-private-keys/newkeys/')
    info('Run option 1 first to generate a key pair.')
    return
  }

  blank()
  console.log(`  Public key files found in newkeys/:`)
  pems.forEach((f, i) => console.log(`  ${C.bold}${i + 1}${C.reset}. ${f}`))
  blank()

  let selectedPem
  if (pems.length === 1) {
    selectedPem = pems[0]
    info(`Using: ${selectedPem}`)
  } else {
    const pick = await askMenu('Which public key to upload?', pems)
    if (pick === null) { info('Aborted.'); return }
    selectedPem = pems[pick]
  }

  const pubPath = join(KEYS_DIR, selectedPem)
  const pubPem  = readFileSync(pubPath, 'utf8')
  const keyId   = process.env.JWT_KEY_ID ?? 'kr-web-dev-dan'

  await runKvUpload({ pubPem, keyId, kvNamespaceId, previewId, kvReady, wVer, pubFilename: selectedPem })
}

// ---------------------------------------------------------------------------
// Shared KV upload logic
// ---------------------------------------------------------------------------
async function runKvUpload({ pubPem, keyId, kvNamespaceId, previewId, kvReady, wVer, pubFilename }) {
  blank()
  label('Key ID (KV key name)', keyId)
  label('Public key file',      pubFilename ?? 'provided')
  blank()

  if (!wVer) {
    err('wrangler not found — cannot upload automatically.')
    info('Install: npm install -g wrangler')
    printManualKvCommand(pubFilename, keyId)
    return
  }
  log(`wrangler: ${wVer}`)

  if (!kvReady) {
    warn('KV namespace ID not set in wrangler.json.')
    info('Run: wrangler kv namespace create KR_KEYS')
    info('Then paste the ID into wrangler.json and re-run this script.')
    printManualKvCommand(pubFilename, keyId)
    return
  }

  // Write to temp file to avoid shell-escaping issues
  const tmpPath = join(KEYS_DIR, '_upload_tmp.txt')
  writeFileSync(tmpPath, stripPem(pubPem))

  info(`Uploading to production KV namespace ${kvNamespaceId}...`)
  try {
    execSync(
      `wrangler kv key put --namespace-id="${kvNamespaceId}" "${keyId}" --path="${tmpPath}"`,
      { stdio: 'inherit', cwd: ROOT },
    )
    log(`Public key uploaded to KV["${keyId}"]`)
  } catch {
    warn('KV upload failed. Check: wrangler login')
    printManualKvCommand(pubFilename, keyId)
  }

  if (previewId && !previewId.startsWith('REPLACE_WITH')) {
    info(`Uploading to preview KV namespace ${previewId}...`)
    try {
      execSync(
        `wrangler kv key put --namespace-id="${previewId}" "${keyId}" --path="${tmpPath}"`,
        { stdio: 'inherit', cwd: ROOT },
      )
      log(`Public key uploaded to preview KV["${keyId}"]`)
    } catch {
      warn('Preview KV upload failed — skipping.')
    }
  } else {
    info('No preview KV namespace configured — skipping.')
  }

  try { writeFileSync(tmpPath, '') } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Manual command fallback
// ---------------------------------------------------------------------------
function printManualKvCommand(pubFilename, keyId) {
  blank()
  info('Manual upload command:')
  console.log(
    `${C.yellow}wrangler kv key put --namespace-id="<YOUR_KV_ID>" "${keyId ?? 'kr-web-dev-dan'}" ` +
    `\\\n  "$(cat private/dev-private-keys/newkeys/${pubFilename ?? 'public.pem'} | grep -v '^--' | tr -d '\\n')"${C.reset}`,
  )
  blank()
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch(e => {
  err(`Unexpected error: ${e.message}`)
  process.exit(1)
})
