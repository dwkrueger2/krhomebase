'use client'
// file: apps/web/features/contacts/useContactCapabilities.client.ts
/**
 * What the signed-in person may do in Contacts Manager: Add contact (`canCreate`), the pencil on any contact
 * (`canUpdate`; one's own contact is always editable), and the Danger Zone (`canMaintain`, super admin). Asked once
 * per page load (`GET /v1/contact-capabilities`). Until the answer arrives, or if it fails, everything is off, so a
 * button never appears and then refuses. (The old app worked this out in the browser from a copy of the role table.)
 */

import { useEffect, useState } from 'react'
import { fetchContactCapabilities, type ContactCapabilities } from './contactEdits.client'

const NOTHING: ContactCapabilities = { canCreate: false, canUpdate: false, canMaintain: false }

export function useContactCapabilities(): ContactCapabilities {
  const [capabilities, setCapabilities] = useState<ContactCapabilities>(NOTHING)
  useEffect(() => {
    let cancelled = false
    fetchContactCapabilities()
      .then((answer) => {
        if (!cancelled) setCapabilities(answer)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return capabilities
}
