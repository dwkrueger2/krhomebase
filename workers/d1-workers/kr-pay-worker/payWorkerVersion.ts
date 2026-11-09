//file: workers/d1-workers/kr-pay-worker/payWorkerVersion.ts
/**
 * Version metadata for kr-pay-worker-live.
 *
 * The Worker belongs to the repository version track (AGENTS_01_version-procedures.md, section 5), so its
 * version is read from the root package.json when Wrangler bundles the Worker. Nothing here is typed by hand,
 * so the number cannot drift from the track. The Cloudflare deployment id comes from the version_metadata
 * binding (CF_VERSION_METADATA in kr-pay-worker.jsonc) and names the exact deployment that answered.
 *
 * Every response carries it:
 *   headers  X-KR-Worker, X-KR-Version, X-KR-Deployment
 *   JSON     a `meta` object (see PayWorkerMeta)
 *   HTML     <meta name="kr-version"> and <meta name="kr-deployment">
 */
import rootPackage from '../../../package.json'

export const PAY_WORKER_NAME = 'kr-pay-worker-live'

/** Cloudflare's version_metadata binding: the deployment that is answering. */
export interface CloudflareVersionMetadata {
  id: string
  tag?: string
  timestamp?: string
}

export interface PayWorkerMeta {
  worker: string
  track: 'repository'
  version: string
  patchNum: string
  patchDate: string
  deploymentId: string | null
  deployedAt: string | null
}

const TRACK = {
  version: String(rootPackage.version),
  patchNum: String(rootPackage.patchNum),
  patchDate: String(rootPackage.patchDate),
} as const

// Set once per isolate from the first request. One isolate runs one deployment, so the value cannot change under it.
let deployment: CloudflareVersionMetadata | null = null

export function rememberDeployment(metadata: CloudflareVersionMetadata | undefined): void {
  if (metadata && !deployment) deployment = metadata
}

export function payWorkerMeta(): PayWorkerMeta {
  const rVal: PayWorkerMeta = {
    worker: PAY_WORKER_NAME,
    track: 'repository',
    version: TRACK.version,
    patchNum: TRACK.patchNum,
    patchDate: TRACK.patchDate,
    deploymentId: deployment?.id ?? null,
    deployedAt: deployment?.timestamp ?? null,
  }
  return rVal
}

/** "1.0.0 p18 (11-09)": the short form used in the header and the HTML meta tag. */
export function payWorkerVersionLabel(): string {
  const rVal = `${TRACK.version} p${TRACK.patchNum} (${TRACK.patchDate})`
  return rVal
}

/** Adds the three version headers to any response. Returns a new Response; the body is passed through. */
export function withVersionHeaders(response: Response): Response {
  const rVal = new Response(response.body, response)
  rVal.headers.set('X-KR-Worker', PAY_WORKER_NAME)
  rVal.headers.set('X-KR-Version', payWorkerVersionLabel())
  rVal.headers.set('X-KR-Deployment', deployment?.id ?? 'unknown')
  return rVal
}

/** HTML meta tags for the page head. Values are fixed strings (version digits, a UUID), escaped anyway. */
export function versionMetaTags(escape: (value: string) => string): string {
  const rVal = `<meta name="kr-worker" content="${escape(PAY_WORKER_NAME)}">\n<meta name="kr-version" content="${escape(payWorkerVersionLabel())}">\n<meta name="kr-deployment" content="${escape(deployment?.id ?? 'unknown')}">`
  return rVal
}
