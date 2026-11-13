// file: apps/web/features/matters/matterDisplay.ts
/**
 * Small display helpers shared by the matters cards. Display only: every rule (numbers, the `.0` title, who may
 * delete) is the API's.
 */

/** Matter numbers compared as the old screen did (numeric parts as numbers, so 055.2 comes before 055.10). */
export function compareMatterNumbers(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true })
}

/** `YYYY-MM-DD` shown as `MM/DD/YYYY` (the firm's date style); anything else is shown as it is. */
export function displayDate(value: string | null | undefined): string {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value
}

/** The tree label of the client: `[055] Example Family` (old `MatterSelector`). */
export function clientTreeLabel(clientNumber: string | null | undefined, displayName: string): string {
  return `[${clientNumber ?? 'No Client #'}] ${displayName.trim() || 'No Display Name'}`
}
