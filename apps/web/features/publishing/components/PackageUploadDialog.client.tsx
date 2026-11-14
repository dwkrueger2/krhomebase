'use client'
// file: apps/web/features/publishing/components/PackageUploadDialog.client.tsx
/**
 * Strict ZIP upload dialog for creating Article and Answer drafts (plan 10, stage 6).
 *
 * Ported from the old `front-end-publishing/components/PackageUploadDialog.client.tsx`. Kept: the dark header with
 * the title for the chosen type and Close; the drop zone ("Drop ZIP package here", the big "DROP HERE" while a file is
 * dragged over it); the Article / Answer Blog choice; Browse for ZIP; Save Article / Save Answer Blog, outlined in
 * the accent once a package is accepted; the GPT Helper Prompt and the "Validating Zip" spinner in the drop zone's
 * corner; the status line; the read-only "Validation messages" box with Copy messages; the "Click SAVE ARTICLE to add
 * to the firm's Article list" line; and every message's wording.
 *
 * Changed:
 *  - The package check is `POST /api/v1/publishing/packages` (`checkArticlePackage`); a refusal lists the API's
 *    `details.problems` and `details.warnings` in the old wording (`PACKAGE_REQUIRES_...`). Saving sends only the
 *    `packageKey` (the panel's `onPackageAccepted` calls `POST /api/v1/publishing/items`); the API reads the stored ZIP
 *    again and makes every key (D22). The accepted text also says each image needs a license before Publish (D25).
 *  - Leaving with an accepted, unsaved package asks in `U6ConfirmationDialog` ("Unsaved package"), the old dialog's
 *    wording; the old screen used `window.confirm` and left its own alert dialog unused.
 *  - GPT Helper Prompt reads `GET /api/v1/publishing/article-prompt` and saves it as the old file name; the old link
 *    downloaded a Markdown route. Until a super admin saves a prompt it says so.
 *  - Drawn into `document.body` with `data-kr-theme-scope="krhomebase"`; `inline` draws it in place for tests. The
 *    old inline `style` objects became the maps below, on the Density Contract (header 8px 10px, body 10px, buttons
 *    26px, 2px to 4px corners; the old 999px prompt pill is a 3px button and the old red "SAVE ARTICLE" is the danger
 *    token).
 *
 * State: this dialog owns the chosen type, the file, the check result and the messages. The panel owns saving.
 */

import type { ArticlePackageCheckData, ContentType } from '@krhomebase/contracts'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import { checkArticlePackage, fetchArticlePrompt, PublishingApiError } from '../api.client'
import { formatIssues, packageLabel, uploadDialogInstruction, uploadDialogTitle, validationSuccessText } from '../publishingRows'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  backdrop: 'bg-[rgba(0,30,58,0.4)]',
  dialog: 'rounded-[4px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  header: 'border-b border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
  title: 'm-0 text-[15px] font-[850] leading-[1.15]',
  headerNote: 'm-0 text-[11px] leading-[1.3] opacity-[0.86]',
  headerButton:
    'px-[9px] py-[3px] min-h-[26px] rounded-[3px] border border-[rgba(255,255,255,0.35)] bg-[rgba(255,255,255,0.08)] text-[11px] font-[800] text-(color:--kr-theme-text-inverse) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  dropZone: 'rounded-[3px] border border-dashed border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-center',
  dropZoneDragging: 'rounded-[3px] border-2 border-solid border-(--kr-theme-success) bg-[rgba(15,24,35,0.75)] text-center text-(color:--kr-theme-text-inverse)',
  dropHere: 'pointer-events-none text-[clamp(2.4rem,8vw,4.6rem)] font-[900] uppercase tracking-[0.18em] text-(color:--kr-theme-text-inverse)',
  dropContentFaded: 'opacity-[0.18]',
  fileName: 'text-[13px] font-[800]',
  muted: 'm-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  typeButton:
    'px-[9px] py-[3px] min-h-[26px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-button-secondary-background) text-[12px] font-[850] text-(color:--kr-theme-text) cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
  typeButtonActive: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
  secondaryButton:
    'px-[10px] py-[3px] min-h-[26px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[800] text-(color:--kr-theme-text) cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
  primaryButton:
    'px-[10px] py-[3px] min-h-[26px] rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-button-primary-hover-background) disabled:cursor-not-allowed disabled:opacity-50',
  saveRing: 'rounded-[4px] border border-transparent',
  saveRingReady: 'rounded-[4px] border border-(--kr-theme-accent)',
  validating: 'text-[12px] font-[900] text-(color:--kr-theme-success)',
  promptButton:
    'px-[9px] py-[3px] min-h-[24px] rounded-[3px] border border-(--kr-theme-success) bg-(--kr-theme-success) text-[12px] font-[800] text-(color:--kr-theme-text-inverse) cursor-pointer disabled:cursor-wait disabled:opacity-70',
  statusLine: 'm-0 text-[12px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  statusSuccess: 'm-0 text-[12px] font-[700] leading-[1.3] text-(color:--kr-theme-success)',
  statusError: 'm-0 text-[12px] font-[700] leading-[1.3] text-(color:--kr-theme-danger)',
  messagesLabel: 'text-[12px] font-[800] text-(color:--kr-theme-text-muted)',
  messages:
    'px-[7px] py-[4px] min-h-[130px] w-full resize-y rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) font-mono text-[11px] leading-[1.35] text-(color:--kr-theme-text)',
  saveCallout: 'font-[800] underline text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  backdrop: 'p-[10px] fixed inset-0 z-[1100] flex items-center justify-center',
  dialog: 'w-[min(760px,calc(100vw-20px))] max-h-[calc(100dvh-20px)] overflow-x-hidden overflow-y-auto',
  header: 'px-[10px] py-[8px] gap-[8px] flex items-start justify-between',
  headerCopy: 'min-w-0 gap-[2px] grid',
  body: 'p-[10px] gap-[8px] grid overflow-x-hidden',
  dropZone: 'p-[10px] gap-[6px] relative grid min-h-[120px] place-items-center',
  dropHere: 'absolute inset-0 z-[2] flex items-center justify-center',
  dropContent: 'gap-[6px] grid justify-items-center',
  typeChooser: 'gap-[6px] flex flex-wrap items-center justify-center',
  buttonRow: 'gap-[6px] flex flex-wrap items-center justify-center',
  saveRing: 'p-[2px] inline-flex',
  promptDock: 'right-[10px] bottom-[8px] gap-[5px] absolute z-[4] inline-flex w-max flex-col items-center',
  validating: 'gap-[6px] pointer-events-none inline-flex items-center justify-center',
  messages: 'gap-[3px] grid',
  messagesHead: 'gap-[6px] flex items-center justify-between',
  saveLine: 'mt-[2px]',
} as const

export interface PackageUploadDialogProps {
  open: boolean
  /** The type chosen when the dialog opens (Article by default). */
  contentType?: ContentType | null
  /** False while the panel is busy: nothing can be checked or saved. */
  mayEdit: boolean
  onClose: () => void
  /** Saves the accepted package as a draft; a thrown error is shown in the dialog. */
  onPackageAccepted: (contentType: ContentType, result: ArticlePackageCheckData) => Promise<void>
  /** Draw in place instead of in `document.body` (tests). */
  inline?: boolean
  /** A first state given instead of checking a file (tests): the file name and either the check result or a refusal. */
  initialCheck?: { fileName: string; contentType?: ContentType; result?: ArticlePackageCheckData; refusal?: PublishingApiError }
}

const START_MESSAGE = 'Choose or drag a .zip package to validate it before saving.'

/** Saves text as a file in the browser (the GPT helper prompt). */
function saveTextFile(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Renders the upload dialog: choose the type, drop or browse for a ZIP, read the check's messages, and save the draft.
 *
 * @param props - Whether it is open, the starting type, the save handler, and for tests `inline` and `initialCheck`.
 * @returns The dialog in `document.body` (or in place), or nothing while closed.
 */
export default function PackageUploadDialog({ contentType, initialCheck, inline = false, mayEdit, onClose, onPackageAccepted, open }: PackageUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [validating, setValidating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [promptBusy, setPromptBusy] = useState(false)
  const [selectedContentType, setSelectedContentType] = useState<ContentType>(initialCheck?.contentType ?? contentType ?? 'article')
  const [selectedFileName, setSelectedFileName] = useState(initialCheck?.fileName ?? '')
  const [acceptedResult, setAcceptedResult] = useState<ArticlePackageCheckData | null>(initialCheck?.result ?? null)
  const [message, setMessage] = useState(() => {
    if (initialCheck?.refusal) return 'Package rejected. Copy the validation text and correct the ZIP package.'
    if (initialCheck?.result) return `Package validated. Save ${packageLabel(initialCheck.contentType ?? 'article')} to add it to the Front End Article List.`
    return START_MESSAGE
  })
  const [issueText, setIssueText] = useState(() => {
    if (initialCheck?.refusal) return formatIssues(initialCheck.refusal.message, initialCheck.refusal.problems, initialCheck.refusal.warnings)
    if (initialCheck?.result) return validationSuccessText(initialCheck.fileName, initialCheck.contentType ?? 'article', initialCheck.result)
    return ''
  })
  const [showUnsavedExitDialog, setShowUnsavedExitDialog] = useState(false)

  useEffect(() => {
    if (open && !initialCheck) setSelectedContentType(contentType ?? 'article')
  }, [contentType, initialCheck, open])

  if (!open) return null

  const contentLabel = packageLabel(selectedContentType)

  function resetForClose(options: { bypassUnsavedWarning?: boolean } = {}): void {
    if (validating || (saving && !options.bypassUnsavedWarning)) return
    if (acceptedResult && !options.bypassUnsavedWarning) {
      setShowUnsavedExitDialog(true)
      return
    }
    setDragging(false)
    setSelectedFileName('')
    setAcceptedResult(null)
    setMessage(START_MESSAGE)
    setIssueText('')
    setShowUnsavedExitDialog(false)
    onClose()
  }

  function chooseType(next: ContentType): void {
    setSelectedContentType(next)
    setAcceptedResult(null)
    setIssueText('')
    setMessage(`${packageLabel(next)} selected. Validate the ZIP before saving.`)
  }

  async function copyIssues(): Promise<void> {
    if (!issueText) return
    try {
      await navigator.clipboard.writeText(issueText)
      setMessage('Validation text copied to clipboard.')
    } catch {
      setMessage('Could not copy to clipboard. Select the text and copy manually.')
    }
  }

  async function downloadPrompt(): Promise<void> {
    if (promptBusy) return
    setPromptBusy(true)
    try {
      const data = await fetchArticlePrompt()
      if (!data.prompt.trim()) {
        setMessage('No GPT helper prompt is saved yet. A super admin saves it in Application Settings, Other Configuration.')
        return
      }
      saveTextFile(data.prompt, 'Boringly strict html generation prompt.md')
    } catch (error) {
      setMessage(error instanceof PublishingApiError ? error.message : 'The GPT helper prompt could not be read.')
    } finally {
      setPromptBusy(false)
    }
  }

  async function validateFile(file: File): Promise<void> {
    if (!mayEdit || validating || saving) return
    setSelectedFileName(file.name)
    setAcceptedResult(null)
    setIssueText('')

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setIssueText(formatIssues('PACKAGE_MUST_BE_ZIP', [`Selected file is ${file.name}. Upload a .zip package.`]))
      setMessage('Package rejected. Upload a .zip file.')
      return
    }

    setValidating(true)
    setMessage(`Validating ${file.name}...`)
    try {
      const result = await checkArticlePackage(selectedContentType, file)
      setAcceptedResult(result)
      setIssueText(validationSuccessText(file.name, selectedContentType, result))
      setMessage(result.warnings.length ? 'Package validated with image tips. Review the tips, then save when ready.' : `Package validated. Save ${contentLabel} to add it to the Front End Article List.`)
    } catch (error) {
      if (error instanceof PublishingApiError) {
        setIssueText(formatIssues(error.message, error.problems, error.warnings))
        setMessage(error.code === 'PUBLISHING_PACKAGE_REFUSED' ? 'Package rejected. Copy the validation text and correct the ZIP package.' : 'Package validation failed before it could be saved.')
      } else {
        L(`[PUBLISHING_UPLOAD:211] check failed error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
        setIssueText(formatIssues('PACKAGE_UPLOAD_FAILED'))
        setMessage('Package validation failed before it could be saved.')
      }
    } finally {
      setValidating(false)
    }
  }

  async function saveAcceptedPackage(): Promise<void> {
    if (!acceptedResult || saving || validating) return
    setSaving(true)
    setMessage(`Saving ${selectedContentType} draft...`)
    try {
      await onPackageAccepted(selectedContentType, acceptedResult)
      setMessage('Package saved. The article list will refresh from the database.')
      setSaving(false)
      resetForClose({ bypassUnsavedWarning: true })
    } catch (error) {
      const refusal = error instanceof PublishingApiError ? error : null
      setIssueText(formatIssues(refusal?.message ?? 'PACKAGE_SAVE_FAILED', refusal?.problems, refusal?.warnings))
      setMessage('The package validated, but saving failed.')
      setSaving(false)
    }
  }

  const busy = validating || saving
  const canSave = mayEdit && Boolean(acceptedResult) && !busy
  const messageStyle = acceptedResult ? STYLES.statusSuccess : issueText ? STYLES.statusError : STYLES.statusLine

  const dialog = (
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-component="PackageUploadDialog" data-kr-element="upload-dialog-backdrop" data-kr-id="PackageUploadDialogBackdrop" data-kr-theme-scope="krhomebase" role="presentation">
      <section aria-busy={busy} aria-labelledby="package-upload-dialog-title" aria-modal="true" className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} data-kr-component="PackageUploadDialog" data-kr-content-type={selectedContentType} data-kr-id="PackageUploadDialog" role="dialog">
        {/* Dialog header: the title for the chosen type, the instruction, and Close. */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`} data-kr-element="upload-dialog-header">
          <div className={LAYOUT_STYLES.headerCopy}>
            <h3 className={STYLES.title} id="package-upload-dialog-title">{uploadDialogTitle(selectedContentType)}</h3>
            <p className={STYLES.headerNote}>{uploadDialogInstruction(selectedContentType)} A GPT Helper Prompt is provided below to help prepare compatible HTML ZIP packages before submission.</p>
          </div>
          <button className={STYLES.headerButton} disabled={busy} type="button" onClick={() => resetForClose()}>Close</button>
        </header>

        <div className={LAYOUT_STYLES.body}>
          {/* Drop zone: type choice, Browse and Save, the prompt and the validating spinner in its corner. */}
          <div
            className={`${LAYOUT_STYLES.dropZone} ${dragging ? STYLES.dropZoneDragging : STYLES.dropZone}`}
            data-kr-id="PackageUploadDialogDropZone"
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setDragging(false)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer.files.item(0)
              if (file) void validateFile(file)
            }}
          >
            <input
              ref={inputRef}
              accept=".zip,application/zip,application/x-zip-compressed"
              hidden
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.item(0)
                if (file) void validateFile(file)
                event.currentTarget.value = ''
              }}
            />
            {dragging ? (
              <div aria-hidden="true" className={`${LAYOUT_STYLES.dropHere} ${STYLES.dropHere}`}>
                DROP HERE
              </div>
            ) : null}
            <div className={`${LAYOUT_STYLES.dropContent} ${dragging ? STYLES.dropContentFaded : ''}`}>
              <strong className={STYLES.fileName}>{selectedFileName || 'Drop ZIP package here'}</strong>
              <p className={STYLES.muted}>Choose Article or Answer Blog, then upload a ZIP with exactly one root HTML file. article.html is preferred. Image filenames can vary if they are valid image files inside /images or /assets/images and are referenced correctly by the HTML.</p>
              {/* Package type: Article or Answer Blog. */}
              <div aria-label="Package type" className={LAYOUT_STYLES.typeChooser} data-kr-element="package-type-chooser" role="group">
                {(['article', 'answer'] as const).map((type) => (
                  <button aria-pressed={selectedContentType === type} className={`${STYLES.typeButton} ${selectedContentType === type ? STYLES.typeButtonActive : ''}`} disabled={busy} key={type} type="button" onClick={() => chooseType(type)}>
                    {packageLabel(type)}
                  </button>
                ))}
              </div>
              <div className={LAYOUT_STYLES.buttonRow}>
                <button className={STYLES.secondaryButton} disabled={!mayEdit || busy} type="button" onClick={() => inputRef.current?.click()}>Browse for ZIP</button>
                <span aria-hidden={!canSave} className={`${LAYOUT_STYLES.saveRing} ${canSave ? STYLES.saveRingReady : STYLES.saveRing}`}>
                  <button className={STYLES.primaryButton} data-kr-action="save-package" disabled={!canSave} type="button" onClick={() => void saveAcceptedPackage()}>
                    {selectedContentType === 'answer' ? 'Save Answer Blog' : 'Save Article'}
                  </button>
                </span>
              </div>
            </div>

            <div className={LAYOUT_STYLES.promptDock} data-kr-id="PackageUploadDialogHelperPromptDock">
              {validating || saving ? (
                <div aria-live="polite" className={LAYOUT_STYLES.validating}>
                  <RainbowBusySpinner ariaLabel={saving ? 'Saving' : 'Validating Zip'} busy hideWhenIdle={false} label="" size={20} />
                  <span className={STYLES.validating}>{saving ? 'Saving' : 'Validating Zip'}</span>
                </div>
              ) : null}
              <button className={STYLES.promptButton} disabled={promptBusy} title="Download a Boringly Strict HTML prompt for helping with using GPT to prepare the article for submission." type="button" onClick={() => void downloadPrompt()}>
                GPT Helper Prompt
              </button>
            </div>
          </div>

          {/* Status line: what happened last. */}
          <p className={messageStyle} data-kr-element="upload-dialog-status" role="status">{message}</p>

          {/* Validation messages: the check's text, ready to copy. */}
          <div className={LAYOUT_STYLES.messages} data-kr-id="PackageUploadDialogValidationMessages">
            <div className={LAYOUT_STYLES.messagesHead}>
              <strong className={STYLES.messagesLabel}>Validation messages</strong>
              <button className={STYLES.secondaryButton} disabled={!issueText} type="button" onClick={() => void copyIssues()}>Copy messages</button>
            </div>
            <textarea aria-label="Validation messages" className={STYLES.messages} readOnly value={issueText || 'Validation messages will appear here after the ZIP is checked.'} />
            {acceptedResult ? (
              <p className={`${LAYOUT_STYLES.saveLine} ${STYLES.statusLine}`}>
                Click <strong className={STYLES.saveCallout}>SAVE {selectedContentType === 'answer' ? 'ANSWER BLOG' : 'ARTICLE'}</strong> to add to the {selectedContentType === 'answer' ? "firm's Answer Blog list" : "firm's Article list"}.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Leaving with an accepted package that is not saved (the old window.confirm). */}
      <U6ConfirmationDialog
        confirmLabel="Yes, leave without saving"
        description={`Your ${contentLabel} has not been saved. Do you want to leave without saving? Cancel goes back so you can save.`}
        open={showUnsavedExitDialog}
        title="Unsaved package"
        onCancel={() => setShowUnsavedExitDialog(false)}
        onConfirm={() => resetForClose({ bypassUnsavedWarning: true })}
      />
    </div>
  )

  if (inline) return dialog
  if (typeof document === 'undefined') return null
  return createPortal(dialog, document.body)
}
