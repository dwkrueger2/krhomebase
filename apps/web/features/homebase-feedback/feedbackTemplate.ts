// file: apps/web/features/homebase-feedback/feedbackTemplate.ts
/**
 * The text a new request starts with (FB-0006, the requester, Nov 16, 2026): who sends it, then two headings to fill
 * in. Also the default title: where in KR Homebase the request was started (`feedbackDefaultTitle`). The form counts
 * either as unsent work only when it differs from this start (root `AGENTS.md`, "Unsaved Changes Standard"), and
 * refuses to send it unchanged.
 */

/**
 * The starting text of the New request form.
 *
 * @param submitterName - The signed-in person's name; left blank when unknown.
 * @returns `Submitter: <name>`, `Problem Statement:` and `Recommended Solution Details:`, a blank line between them.
 */
export function feedbackTemplate(submitterName?: string | null): string {
  const name = String(submitterName ?? '').trim()
  return `Submitter: ${name}\nProblem Statement: \n\nRecommended Solution Details: \n`
}

/**
 * The default title (the requester, Nov 16, 2026): the area and its open tabs, then a colon for the person's words.
 * "&" joins with a hyphen, so "Clients & Contacts" with the WorkStream tab is "Clients-Contacts>WorkStream: ".
 *
 * @param where - The area and tabs (`readSourceArea`).
 * @returns The title to start with; empty when the area is unknown.
 */
export function feedbackDefaultTitle(where: { area: string; tabs: readonly string[] }): string {
  const part = (text: string) => text.replace(/\s*&\s*/g, '-').replace(/\s+/g, ' ').trim()
  const steps = [where.area, ...where.tabs].map(part).filter(Boolean)
  return steps.length ? `${steps.join('>')}: ` : ''
}

/** Whether the title holds words of the person's own (not empty, not only the default title). */
export function hasOwnTitle(title: string, defaultTitle: string): boolean {
  const text = title.trim()
  return text !== '' && text !== defaultTitle.trim()
}

/** Whether the text holds anything beyond the starting template (or anything at all when there is no template). */
export function hasOwnText(body: string, template: string): boolean {
  const text = body.trim()
  return text !== '' && text !== template.trim()
}
