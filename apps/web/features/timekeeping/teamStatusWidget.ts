// file: apps/web/features/timekeeping/teamStatusWidget.ts
/** Dashboard definition for the viewer's selected team status roster. */

import { defineWidget } from '@krhomebase/tool-sdk/manifest'

export const teamStatusWidget = defineWidget({
  id: 'team-status',
  title: 'Team Status',
  description: 'See your selected employees\' clock state and current shift status.',
  size: 'medium',
  defaultEnabled: true,
  defaultOrder: 6,
  requires: { resource: 'attendance', action: 'read' },
  refreshSeconds: 60,
})
