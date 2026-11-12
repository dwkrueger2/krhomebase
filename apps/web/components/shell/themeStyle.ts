// file: apps/web/components/shell/themeStyle.ts
/**
 * Builds the style rule that applies a person's theme above the built-in one (Settings plan, section 13, stage 2b).
 *
 * The frame (`ApplicationShell`) and each pop-out window (`PopOutBrowserWindow`) draw the result in a `<style>`
 * element. It is a rule for every theme scope, not an inline style, so that (plan section 13, point 4):
 * - dialogs drawn into the page body and pop-out windows follow it (every `[data-kr-theme-scope="krhomebase"]`);
 * - the light and dark values stay apart (one block for each `data-kr-theme` value);
 * - printing stays light (`@media screen` only);
 * - it outranks `styles/theme.css`: each selector has four attribute or root parts, and the built-in dark rule three.
 *
 * Safety: the values go through `cleanThemeValues` again here, so only known `--kr-theme-*` names with checked values
 * (hex colors, listed sizes, px paddings, plain font names) are ever written into the rule.
 */

import { cleanThemeValues, type ThemeValueMap } from '@krhomebase/contracts'

/** Selectors for one mode: scopes under `<html data-kr-theme="mode">`, and the frame itself before `<html>` is set. */
function selectorsFor(mode: 'light' | 'dark'): string {
  return [
    `:root[data-kr-theme="${mode}"] [data-kr-theme-scope="krhomebase"][data-kr-theme-scope]`,
    `[data-kr-theme-scope="krhomebase"][data-kr-theme-scope][data-kr-theme="${mode}"][data-kr-theme]`,
  ].join(',\n')
}

/** One mode's block, or an empty string when the mode changes nothing. */
function blockFor(mode: 'light' | 'dark', values: ThemeValueMap): string {
  const clean = cleanThemeValues(values)
  const lines = Object.entries(clean).map(([name, value]) => `  ${name}: ${value};`)
  return lines.length ? `${selectorsFor(mode)} {\n${lines.join('\n')}\n}` : ''
}

/**
 * The style rule for a person's theme.
 *
 * @param values - The values the theme changes, per mode (already layered: firm theme, text size, own colors).
 * @returns CSS text for a `<style>` element, or an empty string when nothing changes.
 */
export function buildThemeStyleCss(values: { light: ThemeValueMap; dark: ThemeValueMap }): string {
  const blocks = [blockFor('light', values.light), blockFor('dark', values.dark)].filter(Boolean)
  return blocks.length ? `@media screen {\n${blocks.join('\n')}\n}` : ''
}
