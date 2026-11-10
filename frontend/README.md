# MediFlow: outpatient patient-flow app (React web + React Native / Expo)

| Folder | What it is |
|---|---|
| `packages/shared` | Shared TypeScript: **customisation file** (`src/config.ts`), visit-plan engine, pricing engine, wait-time estimates, English/Kiswahili strings, visit store |
| `apps/web` | React (Vite) web app: patient portal + staff workspaces (staff code is lazy-loaded) |
| `apps/mobile` | React Native app built with **Expo** (patient app) |

## Run it

```bash
npm install                 # once, from this folder
npm run web                 # http://localhost:5173
npm run mobile              # starts Expo; scan the QR code with Expo Go
```
Expo Go must support **Expo SDK 57**. Phone and computer on the same Wi-Fi, or use `cd apps/mobile && npx expo start --tunnel`.
Other: `npm run typecheck`, `npm run build:web`.

## What changed in this version

**Dynamic journeys** (`config.routes`): the patient chooses a visit type (new ailment, appointment, follow-up, results review, refill only, pay a bill) and sees only the steps that apply.
- *Automatic skips:* registration is skipped for booked visits or when details were confirmed in the last 30 days; lab and pharmacy drop out if the doctor orders nothing (shown as "skipped: no tests ordered").
- *Patient-deferrable:* lab ("notify me") and pharmacy ("collect later") only. Triage and consultation can never be skipped.
- *Fast-track:* red-flag words (`config.redFlags`) show emergency advice and move the patient to the front for the doctor.
- *Undo:* patients can step back from registration; staff can undo the last completion.

**Dynamic pricing** (`config.pricing`, `src/pricing.ts`): price list by consultation type, rule discounts (booking 10%, follow-up within 14 days free), insurance percentage, staff-authorised waivers, a price-list `version` printed on every statement, a running "cost so far / may rise to" estimate, and a price shown **before** tests are done: the doctor proposes, the patient approves each item.

**HCI and service:** SMS-code sign-in; Today / Appointments / Records / Profile tabs; reschedule and cancel with confirmation; inline form validation; English and Kiswahili (`src/i18n.ts`); wait **ranges** instead of false precision; proactive "doctor running late" notice; QR check-in (simulated); M-Pesa pending / retry / failed states; call or WhatsApp help on every screen; 48 px touch targets, labels and roles for screen readers, AA contrast colours, reduced-motion support; star feedback after checkout; staff shortcuts (N call next, Enter complete, U undo); visit state survives a refresh or closed app (localStorage / AsyncStorage).

## Frontend improvements

The web patient dashboard now surfaces a compact current-visit summary before the existing journey stepper. Appointment booking, rescheduling, and cancellation are routed through `apps/web/src/services/visitService.ts`, which currently delegates to the local shared store and is the intended seam for later API calls. Appointment actions prevent repeated submissions while a save is in progress and cancellation requires confirmation.

The staff workspace includes queue search and filters, a selected-patient summary, role-specific desk descriptions, clearer queue states, and keyboard shortcuts that avoid firing while a form control is focused. Shared web UI components in `apps/web/src/ui.tsx` provide consistent page headings, status badges, empty/loading/error states, patient summaries, and confirmation dialogs. These are frontend usability improvements; staff authorization and live queue data still need to come from the backend.

See [FRONTEND_IMPROVEMENTS.md](FRONTEND_IMPROVEMENTS.md) for implementation details and the suggested API integration path.

## Customise (`packages/shared/src/config.ts`)

| To change | Edit |
|---|---|
| Hospital name, contacts, currency | `config.hospital` |
| Colours (both apps) | `config.theme` |
| Stage timing and staff counts | `config.stages` |
| Which stages each visit type uses | `config.routes`, `config.routeOrder` |
| Prices, discount rules, insurance, waiver reasons | `config.pricing` (bump `version` when you change prices) |
| Lab tests, drugs, demo orders | `config.labTests`, `config.drugs`, `config.demoOrders` |
| Emergency words | `config.redFlags` |
| Text and translations | `src/i18n.ts` |
| Hide demo controls | `config.demoMode = false` |

## Honest limits

- **No backend yet.** Data is mock and stored on the device; the web and mobile apps do not share live state until there is a server. `src/store.ts` is the part to replace with API calls.
- M-Pesa, SMS, push and QR scanning are simulated. The staff workspace is web only and English only.
- The Kiswahili text is a first draft: have a native or medical translator review it before real use.
- Insurance is a generic "covers X%" demo, not SHA rules. Real claims are out of scope.
- Checked here: type checks, a logic test suite of every route, a render test of 34 web screens in both languages, a web build and an Android bundle. **Not** tested on a physical phone or in a browser window from this environment: please try it in Expo Go and report anything odd.
