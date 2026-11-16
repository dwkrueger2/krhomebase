// file: apps/api/src/platform/payQr.ts
/**
 * Pay-link QR codes (Billing part 7d, `docs/API/Billing_Audit.md` section 6.3): an SVG data address for the printed
 * invoice and its PDF, and a PNG for email.
 *
 * Email clients (Gmail, Outlook) block SVG and data: images, so the invoice email carries the QR code as an inline PNG
 * referenced by `cid:kr-pay-qr` and wrapped in a link to the same pay URL. The PNG is encoded here from the `qrcode`
 * module matrix (no canvas / pngjs needed); compression uses CompressionStream('deflate'), which is available in both
 * Node and the Cloudflare Worker runtime.
 *
 * Ported from the old `api/_server/krPayQrPng.ts`, and the SVG from the old `print-pay-link` and `send-invoice` routes
 * (`QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#1b2330' } })`).
 * Changed:
 *  - `Buffer` is gone: bytes are `Uint8Array` and base64 is made with `btoa`, so the file runs in a Worker.
 *  - The SVG is drawn here from the same matrix (`create` is the only `qrcode` function used), so the Worker bundle
 *    (the package's browser build) and the tests (its Node build) draw the same picture.
 *  - The attachment is the mailer's `InlineImage` (`contentId`, `contentType`, `filename`, `base64`).
 *  - `inlinePayQr` is not ported: `firmEmail.ts` `withImagesInline` swaps every `cid:` image for a preview.
 */

import { create } from 'qrcode'
import type { InlineImage } from './googleWorkspaceMailer.ts'

/** Content-ID of the inline QR image (`cid:kr-pay-qr`). */
export const PAY_QR_CONTENT_ID = 'kr-pay-qr'

/** `src` value for the QR image inside the email HTML. */
export const PAY_QR_CID_SRC = `cid:${PAY_QR_CONTENT_ID}`

/** Pixels per QR module and quiet-zone modules around the code (PNG). */
const QR_SCALE = 8
const QR_MARGIN = 2
/** Quiet zone of the SVG, in modules (the old `margin: 1`). */
const SVG_MARGIN = 1
/** Ink color (#1b2330, same as the PDF) and background. */
const QR_DARK = '#1b2330'
const QR_LIGHT = '#ffffff'

/** Palette: index 0 = white background, index 1 = ink (#1b2330, same as the PDF). */
const QR_PALETTE = [0xff, 0xff, 0xff, 0x1b, 0x23, 0x30]

/** The QR matrix of `text`: its size and whether each module is dark. */
function qrMatrix(text: string): { size: number; dark: (row: number, col: number) => boolean } {
  const modules = create(text, { errorCorrectionLevel: 'M' }).modules
  return { size: modules.size, dark: (row, col) => Boolean(modules.get(row, col)) }
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** One PNG chunk: length, type, data, CRC(type + data). */
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(new ArrayBuffer(12 + data.length))
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i += 1) chunk[4 + i] = type.charCodeAt(i)
  chunk.set(data, 8)
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
  return chunk
}

/** zlib-wrapped deflate (what the PNG IDAT chunk expects). */
async function zlibDeflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
  const rVal = new Uint8Array(await new Response(stream).arrayBuffer())
  return rVal
}

/** Bytes → base64 (chunked, so a large image does not overflow the argument list). */
function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(text)
}

/**
 * Renders `text` as a QR code PNG (8-bit palette, two colors).
 *
 * @param text - Content to encode (the pay URL).
 * @returns PNG bytes.
 */
export async function buildQrPng(text: string): Promise<Uint8Array> {
  const modules = qrMatrix(text)
  const count = modules.size + QR_MARGIN * 2
  const side = count * QR_SCALE
  // Raw scanlines: 1 filter byte (0 = none) + one palette index per pixel.
  const raw = new Uint8Array(new ArrayBuffer((side + 1) * side))
  for (let y = 0; y < side; y += 1) {
    const row = Math.floor(y / QR_SCALE) - QR_MARGIN
    const offset = y * (side + 1)
    raw[offset] = 0
    for (let x = 0; x < side; x += 1) {
      const col = Math.floor(x / QR_SCALE) - QR_MARGIN
      const dark = row >= 0 && col >= 0 && row < modules.size && col < modules.size && modules.dark(row, col)
      raw[offset + 1 + x] = dark ? 1 : 0
    }
  }
  const header = new Uint8Array(13)
  const headerView = new DataView(header.buffer)
  headerView.setUint32(0, side)
  headerView.setUint32(4, side)
  header[8] = 8 // bit depth
  header[9] = 3 // color type: palette
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const parts = [signature, pngChunk('IHDR', header), pngChunk('PLTE', new Uint8Array(QR_PALETTE)), pngChunk('IDAT', await zlibDeflate(raw)), pngChunk('IEND', new Uint8Array(0))]
  const rVal = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    rVal.set(part, at)
    at += part.length
  }
  return rVal
}

/**
 * The QR code of `text` as an SVG (one path, one module per unit, a quiet zone of one module).
 *
 * @param text - Content to encode (the pay URL).
 * @returns The SVG document text.
 */
export function buildQrSvg(text: string): string {
  const modules = qrMatrix(text)
  const side = modules.size + SVG_MARGIN * 2
  let path = ''
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) if (modules.dark(row, col)) path += `M${col + SVG_MARGIN} ${row + SVG_MARGIN}h1v1h-1z`
  }
  const rVal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><path fill="${QR_LIGHT}" d="M0 0h${side}v${side}H0z"/><path fill="${QR_DARK}" d="${path}"/></svg>`
  return rVal
}

/** The QR code of `text` as an SVG data address (`data:image/svg+xml;base64,…`), for the printed invoice and the PDF. */
export function buildQrSvgDataUri(text: string): string {
  const rVal = `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(buildQrSvg(text)))}`
  return rVal
}

/**
 * Inline email image for the pay-link QR code.
 *
 * @param url - Absolute pay URL.
 * @returns The image referenced by `cid:kr-pay-qr`.
 */
export async function buildPayQrImage(url: string): Promise<InlineImage> {
  const rVal: InlineImage = { contentId: PAY_QR_CONTENT_ID, contentType: 'image/png', filename: 'pay-invoice-qr.png', base64: toBase64(await buildQrPng(url)) }
  return rVal
}

/**
 * Finds the pay URL the stored email's QR image links to (for re-sends, which must attach the image again).
 *
 * @returns The link, or null when the email has no QR image.
 */
export function findPayQrHref(html: string): string | null {
  if (!html.includes(PAY_QR_CID_SRC)) return null
  const match = /<a href="([^"]+)"[^>]*>[^<]*<img[^>]*src="cid:kr-pay-qr"/.exec(html)
  const rVal = match ? match[1]!.replace(/&amp;/g, '&') : null
  return rVal
}
