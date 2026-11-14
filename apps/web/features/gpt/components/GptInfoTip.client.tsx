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
 * @param props.panel - True beside an editor label: the old panel's tooltip was 240px wide (the dialog's is 220px).
 */

import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import styles from './GptInfoTip.module.css'

export default function GptInfoTip({ label, panel = false }: { label: string; panel?: boolean }) {
  return (
    <span aria-label={label} className={panel ? `${styles.info} ${styles.infoPanel}` : styles.info} data-kr-element="gpt-info-tip" role="img" tabIndex={0}>
      <KRHomebaseIcons.InfoLetter className="h-[11px] w-[11px]" />
    </span>
  )
}
