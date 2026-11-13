'use client'
// file: apps/web/features/gpt/components/GptInfoTip.client.tsx
/**
 * The round "i" help badge used beside GPT Model Gateway labels (old `<span className={styles.info} tabIndex={0}
 * aria-label="…">i</span>`). The help text is the `label`; it shows on hover and on keyboard focus through the
 * badge's CSS module (`GptInfoTip.module.css`, the one CSS file of this feature, for the `::after` tooltip).
 *
 * Changed from the old badge: the "i" is `KRHomebaseIcons.InfoLetter` instead of a text glyph.
 *
 * @param props.label - The help text, read by screen readers and shown as the tooltip.
 */

import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import styles from './GptInfoTip.module.css'

export default function GptInfoTip({ label }: { label: string }) {
  return (
    <span aria-label={label} className={styles.info} data-kr-element="gpt-info-tip" role="img" tabIndex={0}>
      <KRHomebaseIcons.InfoLetter className="h-[11px] w-[11px]" />
    </span>
  )
}
