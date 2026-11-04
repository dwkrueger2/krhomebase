'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import styles from './RainbowBusySpinner.module.css'

export interface RainbowBusySpinnerHandle {
  /** Shows the spinner and optionally updates the status message. */
  beginBusy: (label?: string) => void
  /** Hides the spinner without clearing the current status message. */
  endBusy: () => void
  /** Updates the status message shown next to the spinner. */
  setStatus: (message?: string, isError?: boolean) => void
  /** Shows a message, then clears it after the requested delay. */
  setTemporaryStatus: (message: string, isError?: boolean, persistMs?: number) => void
  /** Clears the message, error state, and busy state. */
  clear: () => void
}

export interface RainbowBusySpinnerProps {
  /** Controlled busy state. Leave undefined to use the imperative ref helpers. */
  busy?: boolean
  /** Initial busy state for uncontrolled usage. */
  defaultBusy?: boolean
  /** Controlled status text. Leave undefined to let the component manage its own message. */
  label?: string
  /** Initial status text for uncontrolled usage. */
  defaultLabel?: string
  /** Whether the label should be styled as an error. */
  isError?: boolean
  /** Accessible label used when no visible label is supplied. */
  ariaLabel?: string
  /** Spinner diameter in CSS pixels. */
  size?: number
  /** Hide the whole row when not busy and no message is present. */
  hideWhenIdle?: boolean
  /** Keep the row's layout space even when it is idle. */
  reserveSpace?: boolean
  /** Stretch to the full available width. */
  block?: boolean
  /** Show the standard component-review label while the spinner is busy. */
  showPreviewLabel?: boolean
  className?: string
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

const DEFAULT_BUSY_LABEL = 'Working...'
const PREVIEW_LABEL = 'Loading Component Preview'

/**
 * Reusable rainbow busy spinner derived from the TalkAloudTool beginBusy/endBusy pattern.
 *
 * Ported from the old KR Homebase app (`hb-lib/RainbowBusySpinner`) so that `U6ConfirmationDialog`
 * keeps its standard request indicator. Behavior is unchanged.
 *
 * Inputs: the props above. Output: a `role="status"` row holding a spinning ring and an optional
 * text label. It can be controlled (pass `busy` and `label`) or driven through the ref handle
 * (`beginBusy`, `endBusy`, `setStatus`, `setTemporaryStatus`, `clear`). State ownership: when `busy`
 * or `label` is passed the parent owns that value; otherwise the component keeps its own.
 *
 * @example Controlled usage
 * <RainbowBusySpinner busy={isLoading} label={isLoading ? 'Fetching selected text...' : ''} />
 *
 * @example Imperative usage
 * const busyRef = useRef<RainbowBusySpinnerHandle>(null)
 * busyRef.current?.beginBusy('Fetching selected text...')
 * busyRef.current?.endBusy()
 * busyRef.current?.setTemporaryStatus('Selected text copied.', false, 5000)
 * <RainbowBusySpinner ref={busyRef} />
 */
const RainbowBusySpinner = forwardRef<RainbowBusySpinnerHandle, RainbowBusySpinnerProps>(
  (
    {
      ariaLabel,
      block = false,
      busy,
      className,
      defaultBusy = false,
      defaultLabel = '',
      hideWhenIdle = true,
      isError = false,
      label,
      reserveSpace = false,
      showPreviewLabel = false,
      size = 14,
    },
    ref,
  ) => {
    const [internalBusy, setInternalBusy] = useState(defaultBusy)
    const [internalLabel, setInternalLabel] = useState(defaultLabel)
    const [internalError, setInternalError] = useState(isError)
    const timerRef = useRef<number | null>(null)

    const isControlledBusy = typeof busy === 'boolean'
    const isControlledLabel = typeof label === 'string'
    const isBusy = isControlledBusy ? busy : internalBusy
    const displayLabel = isControlledLabel ? label : internalLabel
    const renderedLabel = showPreviewLabel && isBusy ? PREVIEW_LABEL : displayLabel
    const hasMessage = renderedLabel.trim().length > 0
    const isVisible = isBusy || hasMessage
    const shouldShowError = isError || internalError

    const clearTimer = useCallback(() => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }, [])

    const beginBusy = useCallback(
      (nextLabel?: string) => {
        clearTimer()
        if (!isControlledBusy) setInternalBusy(true)
        if (typeof nextLabel === 'string' && !isControlledLabel) {
          setInternalLabel(nextLabel)
          setInternalError(false)
        }
      },
      [clearTimer, isControlledBusy, isControlledLabel],
    )

    const endBusy = useCallback(() => {
      if (!isControlledBusy) setInternalBusy(false)
    }, [isControlledBusy])

    const setStatus = useCallback(
      (message = '', nextIsError = false) => {
        clearTimer()
        if (!isControlledLabel) setInternalLabel(message)
        setInternalError(nextIsError)
      },
      [clearTimer, isControlledLabel],
    )

    const setTemporaryStatus = useCallback(
      (message: string, nextIsError = false, persistMs = 5000) => {
        setStatus(message, nextIsError)
        timerRef.current = window.setTimeout(() => {
          if (!isControlledLabel) setInternalLabel('')
          setInternalError(false)
          timerRef.current = null
        }, persistMs)
      },
      [isControlledLabel, setStatus],
    )

    const clear = useCallback(() => {
      clearTimer()
      if (!isControlledBusy) setInternalBusy(false)
      if (!isControlledLabel) setInternalLabel('')
      setInternalError(false)
    }, [clearTimer, isControlledBusy, isControlledLabel])

    useImperativeHandle(
      ref,
      () => ({
        beginBusy,
        clear,
        endBusy,
        setStatus,
        setTemporaryStatus,
      }),
      [beginBusy, clear, endBusy, setStatus, setTemporaryStatus],
    )

    useEffect(() => clearTimer, [clearTimer])

    const style = useMemo(
      () =>
        ({
          '--rainbow-spinner-inner-inset': `${Math.max(2, Math.round(size * 0.21))}px`,
          '--rainbow-spinner-size': `${size}px`,
        }) as CSSProperties,
      [size],
    )

    const rootClassName = joinClassNames(
      styles.root,
      block && styles.block,
      isVisible && styles.visible,
      shouldShowError && styles.error,
      hideWhenIdle && styles.hiddenWhenIdle,
      reserveSpace && styles.reserveSpace,
      className,
    )

    return (
      <div
        aria-busy={isBusy}
        aria-live="polite"
        className={rootClassName}
        role="status"
        style={style}
      >
        {/* Spinning rainbow ring: turns while the component is busy or showing a message */}
        <span
          aria-label={ariaLabel || renderedLabel || DEFAULT_BUSY_LABEL}
          className={styles.spinner}
          title={renderedLabel || DEFAULT_BUSY_LABEL}
        />
        {/* Status text next to the ring; shown in the error color when isError is set */}
        {hasMessage ? <span className={styles.label}>{renderedLabel}</span> : null}
      </div>
    )
  },
)

RainbowBusySpinner.displayName = 'RainbowBusySpinner'

export default RainbowBusySpinner
