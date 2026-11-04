import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { U6ConfirmationDialog } from './U6ConfirmationDialog.client'

const base = { title: 'Delete note', description: 'This cannot be undone.', confirmLabel: 'Delete', onCancel: vi.fn(), onConfirm: vi.fn() }

describe('U6ConfirmationDialog', () => {
  it('renders nothing when closed', () => {
    expect(renderToStaticMarkup(<U6ConfirmationDialog {...base} open={false} />)).toBe('')
  })

  it('renders an accessible modal dialog with title, message and two buttons', () => {
    const html = renderToStaticMarkup(<U6ConfirmationDialog {...base} open />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Delete note"')
    expect(html).toContain('This cannot be undone.')
    expect(html).toContain('>Cancel<')
    expect(html).toContain('>Delete<')
    expect(html).not.toContain('u6-confirmation-secondary')
  })

  it('shows the error text in place of the description', () => {
    const html = renderToStaticMarkup(<U6ConfirmationDialog {...base} open error="Save failed." />)
    expect(html).toContain('Save failed.')
    expect(html).not.toContain('This cannot be undone.')
  })

  it('colors the message gray normally and red when it is an error', () => {
    expect(renderToStaticMarkup(<U6ConfirmationDialog {...base} open />)).toContain('text-(color:--kr-theme-text-muted)')
    const withError = renderToStaticMarkup(<U6ConfirmationDialog {...base} open error="Save failed." />)
    expect(withError).toContain('text-(color:--kr-theme-danger)')
    expect(withError).not.toContain('text-(color:--kr-theme-text-muted)')
  })

  it('shows the secondary button only when both its label and handler are given', () => {
    expect(renderToStaticMarkup(<U6ConfirmationDialog {...base} open secondaryLabel="Just reviewing" />)).not.toContain('Just reviewing')
    expect(renderToStaticMarkup(<U6ConfirmationDialog {...base} open secondaryLabel="Just reviewing" onSecondary={vi.fn()} />)).toContain('Just reviewing')
  })

  it('disables every button and shows the busy indicator while busy', () => {
    const html = renderToStaticMarkup(<U6ConfirmationDialog {...base} open busy busyLabel="Deleting..." />)
    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(html).toContain('role="status"')
    expect(html).toContain('Deleting...')
    expect(html).not.toContain('>Delete<')
  })
})
