'use client'
// file: apps/web/features/settings/components/SettingsPanel.client.tsx
/**
 * The Settings landing page (menu id `settings`; plan `docs/08_Settings_Dashboard_Plan.md`, stage 1).
 *
 * It replaces the "Module [TBD]" placeholder. Two groups of choice cards, in the old landing page's card grid (one
 * column on a phone, two at tablet width, three from desktop width; the old page had three from 768px, which is too
 * narrow beside the open menu; reference section 3.1, "Landing page"):
 * 1. **Areas:** User Settings, Application Settings (super admin only) and Firm Settings. A card opens its section.
 * 2. **IT (super admin):** Data Import, GPT Model Gateway and Stripe Payment Configuration, in their own orange card
 *    styles and with their old ids. A card opens Firm Settings at that page (`openSection('firm-settings', page)`).
 *
 * The old landing page's Reports card and its development-only Developer Tests card are not carried over: Reports
 * has its own menu row, and test links do not ship in this app (apps/web/AGENTS.md, boundary rule 6).
 *
 * `isSuperAdmin` comes from the session in `app/page.tsx`. It only hides cards; the API decides what anyone may
 * read or change.
 *
 * @param props - Whether the signed-in person is a super admin.
 * @returns The landing page (`data-kr-id="SettingsPanel"`).
 */

import { useShellNavigation } from '@/components/shell/shellNavigation'
import SettingsChoiceCard from '@/features/settings/components/SettingsChoiceCard.client'
import { SETTINGS_AREA_CARDS, SETTINGS_IT_CARDS, type SettingsChoiceDefinition } from '@/features/settings/settingsAreas'

const LAYOUT_STYLES = {
  // The 36px right padding keeps the cards clear of the workspace's pop-out button (as Contact Detail does).
  panel: 'p-[8px] pr-[36px] gap-[10px] grid content-start',
  group: 'min-w-0 gap-[6px] grid',
  // Two across at tablet width (beside the open menu three were about 170px wide), three from desktop width.
  grid: 'gap-[8px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
} as const

const STYLES = {
  groupLabel: 'm-0 text-[11px] font-extrabold tracking-[.12em] uppercase text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface SettingsPanelProps {
  /** True for a super admin: shows the Application Settings card and the IT cards. */
  isSuperAdmin?: boolean
}

export default function SettingsPanel({ isSuperAdmin = false }: SettingsPanelProps) {
  const navigation = useShellNavigation()
  const areaCards = SETTINGS_AREA_CARDS.filter((card) => isSuperAdmin || !card.superAdminOnly)

  /** Draws one card; choosing it opens its section, at its page when it names one. */
  function renderCard(card: SettingsChoiceDefinition) {
    return (
      <SettingsChoiceCard
        action={card.action}
        description={card.description}
        icon={card.icon}
        key={card.krId}
        krId={card.krId}
        onSelect={() => navigation.openSection(card.sectionId, card.subPage)}
        targetId={card.subPage ?? card.sectionId}
        title={card.title}
        variant={card.variant}
      />
    )
  }

  return (
    <div className={LAYOUT_STYLES.panel} data-kr-id="SettingsPanel">
      {/* Areas: one card for each Settings area this person may open */}
      <section className={LAYOUT_STYLES.group} aria-label="Settings choices" data-kr-element="settings-choice-grid">
        <div className={LAYOUT_STYLES.grid}>{areaCards.map(renderCard)}</div>
      </section>

      {/* IT cards (super admin): the firm's technical settings, in their own orange card styles */}
      {isSuperAdmin ? (
        <section className={LAYOUT_STYLES.group} aria-labelledby="settings-it-cards-label" data-kr-element="settings-it-card-grid">
          <h2 className={STYLES.groupLabel} id="settings-it-cards-label">
            Firm IT · Super Admin
          </h2>
          <div className={LAYOUT_STYLES.grid}>{SETTINGS_IT_CARDS.map(renderCard)}</div>
        </section>
      ) : null}
    </div>
  )
}
