// file: apps/web/features/timekeeping/clockInWidget.ts
/**
 * The Dashboard widget definition for Employee Time Entry (Settings and Dashboard plan, stage 3). The old registry
 * entry was id `employee-clock-in`, title "Employee Clock In", for everyone, enabled, order 5, size medium
 * (reference section 7.1). The title is now the old card's own heading ("EMPLOYEE TIME ENTRY", drawn in uppercase).
 * The old entry had no role limit; `requires` names the Attendance read grant, and the widget says so in its card when
 * the API refuses.
 *
 * `app/page.tsx` pairs it with `EmployeeClockInWidget` and hands both to the Dashboard and to User Settings →
 * Dashboard.
 */

import { defineWidget } from '@krhomebase/tool-sdk/manifest'

export const employeeClockInWidget = defineWidget({
  id: 'employee-clock-in',
  title: 'Employee Time Entry',
  description: 'Clock in or out from the Dashboard and open your time card.',
  size: 'medium',
  defaultEnabled: true,
  defaultOrder: 5,
  requires: { resource: 'attendance', action: 'read' },
  refreshSeconds: 60,
})
