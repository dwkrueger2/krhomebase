'use client'
// file: apps/web/features/tools/components/ToolKitDownload.client.tsx
/**
 * Shows the SDK archive in R2 and downloads it for a super admin or Internal Developer. The API decides access;
 * this component exposes only metadata and a download action, never registration or other admin controls.
 */

import { useEffect, useState } from 'react'
import { TOOL_SDK_VERSION } from '@krhomebase/tool-sdk/version'
import { downloadToolSdk, fetchToolSdk } from '@/features/tools/api.client'

const LAYOUT_STYLES = {
  group: 'gap-[4px] flex items-center',
} as const

const STYLES = {
  text: 'm-0 text-[12px] leading-tight text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] leading-tight text-(color:--kr-theme-danger)',
  button: 'h-[24px] px-[8px] rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[12px] font-semibold text-(color:--kr-theme-text-inverse) cursor-pointer disabled:cursor-wait disabled:opacity-65',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

/** Reads archive metadata once, keeps download errors inline and revokes the temporary browser URL afterward. */
export default function ToolKitDownload() {
  const [stored, setStored] = useState<{ version: string; fileName: string; size: number; uploadedAt: string } | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    void fetchToolSdk().then((result) => {
      if (!alive) return
      if (result.ok) {
        setStored(result.data)
        setMissing(false)
      } else if (result.message === 'No tool kit stored yet.') {
        setMissing(true)
      } else {
        setError(result.message)
      }
    })
    return () => { alive = false }
  }, [])

  async function handleDownload() {
    setBusy(true)
    setError('')
    const result = await downloadToolSdk()
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      if (result.message === 'No tool kit stored yet.') setMissing(true)
      return
    }
    const url = URL.createObjectURL(result.data.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.data.fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const versionText = stored && stored.version !== TOOL_SDK_VERSION
    ? `Stored ${stored.version}; this build is ${TOOL_SDK_VERSION}.`
    : stored ? `Stored ${stored.version}.` : ''

  return (
    <div className={LAYOUT_STYLES.group} data-kr-id="ToolKitDownload" data-kr-element="tool-kit-download">
      {stored ? <span className={STYLES.text}>{versionText}</span> : null}
      {missing ? <span className={STYLES.text}>No tool kit stored yet.</span> : null}
      <button type="button" className={STYLES.button} onClick={() => void handleDownload()} disabled={busy || !stored} data-kr-element="tool-kit-download-button">
        {busy ? 'Downloading…' : `Download ${stored?.version ?? 'tool kit'}`}
      </button>
      {error ? <p role="alert" className={STYLES.error} data-kr-element="tool-kit-download-error">{error}</p> : null}
    </div>
  )
}
