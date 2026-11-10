# Frontend improvements

This update adds usability and API-preparation improvements on top of the existing MediFlow screens and shared visit engine.

## What changed

- The patient Today screen shows a current-visit summary with the patient identifier, current stage, visit status, and next stage. Existing progress, wait, cost, and timeline panels remain in place.
- Appointment list, booking, rescheduling, and cancellation screens use clearer page headings and states. Booked visits have a confirmed badge, empty history has an explicit empty state, cancellation is confirmed, and booking/rescheduling prevents repeated submissions while the operation is pending.
- Appointment mutations go through `apps/web/src/services/visitService.ts`. The service delegates to the existing local store today; it can be replaced with API calls without moving request code into the screens.
- The staff workspace has a searchable, filterable queue, a selected-patient summary, desk-specific descriptions, and queue-empty/no-results states. Keyboard shortcuts do not fire while a form control, button, or link is focused and ignore repeated key events.
- Shared web components in `apps/web/src/ui.tsx` include `PageHeader`, `StatusBadge`, `EmptyState`, `LoadingState`, `ErrorState`, `PatientSummaryCard`, and `ConfirmDialog`.
- The current-visit summary is translated in English and Kiswahili. New empty-state copy for records is currently English because existing record labels do not provide that wording.

## Backend integration path

1. Replace the local delegates in `visitService.ts` with typed API calls while keeping the same screen-facing methods.
2. Add server-backed loading, retry, and validation-error states to appointment operations; shared loading and error components are available for that work.
3. Add server authorization for staff roles and derive queue rows, patient details, confirmed appointment states, and queue metrics from server responses.
4. Keep the server authoritative for appointment availability and status. The client-side submission lock only prevents repeated clicks in this UI; it is not a substitute for server-side idempotency or concurrency checks.

## Validation status

The files were reviewed for consistency with the existing app structure. Run `npm install`, `npm run typecheck`, and `npm run build:web` from the project root in the working environment before merging these changes. No backend behavior, authentication, clinical rules, or appointment states were invented here.
