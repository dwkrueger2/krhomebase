---
version: 1
slug: "settings-it-cards"
primary_target: "features/settings/components/SettingsPanel.client.tsx"
related_targets: ["features/settings/components/SettingsChoiceCard.client.tsx","features/settings/settingsAreas.ts"]
---

# Settings IT cards surface brief

Version 1.0, Nov 11, 2026. Plan: `docs/08_Settings_Dashboard_Plan.md` (sections 1, 3 and 4; stage 1). Old screen: the Firm Settings menu in `modules/settings/firm-settings/FirmSettingsSection.client.tsx` and its card CSS in `modules/KRManagementCards.module.css` (read-only reference; recorded in `docs/API/Settings_AsIs_Reference.md` section 3.1, "Card CSS").

## Scope and mode

- Mode: **Operate**. A super admin opens the firm's technical settings from here a few times a month.
- Surface: the Settings landing page (menu id `settings`), group "Firm IT · Super Admin". Three cards: Data Import, GPT Model Gateway, Stripe Payment Configuration. Each opens Firm Settings at that page.
- An extension of the established world in `DESIGN.md`, not a new visual world. No new tokens.

## Where it follows DESIGN.md

- The landing page's plain area cards (User, Application and Firm Settings): Card White, 1px Cool Hairline, 2px corners, the 26px Firm Navy glyph badge, 14px title and 12px muted line, three across from tablet width and one column on a phone.
- The Firm Settings pages behind the cards use the shared Menu Style One tab strip.

## Where it departs (the stated exceptions)

The requester's direction (Nov 11, 2026): keep the card style of `firm-settings-gpt-model-gateway-card`, `firm-settings-stripe-payment-configuration-card` and `FirmSettingsMenu-option-data-management`.

- **Data Import** (`FirmSettingsMenu-option-data-management`, variant `it-outline`): border is Signal Orange mixed 48% into the hairline, the badge is Signal Orange, and hover or focus turns the border Signal Orange with a 2px orange ring at 18%.
- **GPT Model Gateway and Stripe Payment Configuration** (variant `it-solid`): solid Signal Orange card and border, white title and text, a white 20% badge, and a 3px orange ring at 28% on hover or focus.
- The ids, glyphs (D, G, $), titles and lines are the old cards', except the GPT line, which no longer says the workspace is "implemented".

Design checks that flag the orange fill, the white-on-orange text or the outline mix on these three cards are not defects.

## Pages behind the cards (later stages)

- Stripe Payment Configuration (stage 6): ported exactly, class for class (reference section 5).
- GPT Model Gateway (stage 7): similar style; keeps the 4px orange left bar; the Edit Model Connection dialog keeps its look exactly and gains `data-kr-id="firm-settings-gpt-connection-dialog"` (reference section 6).
- Data Import (stage 8): keeps the card style; the old orange gradient top bar of its workspace card is recorded in reference section 3.1.

## States

- Not a super admin: the IT group is not drawn, and the IT pages are not in Firm Settings.
- Hover and keyboard focus: the rings above; no other motion.
