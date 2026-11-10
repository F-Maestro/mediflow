# MediFlow client and API integration

The web and mobile clients use the API in `../backend` for authentication, patient identity, appointments, visits, catalog prices, health trends, history requests, staff queues, clinical orders, payments, and support conversations. Visit stages, measured vitals, approved orders, charge lines, and M-Pesa status are server-owned. The clients refresh active visits and staff queues every few seconds.

## Local addresses

- Web: copy `apps/web/.env.example` to `apps/web/.env`; set `VITE_API_URL` to the API origin, such as `http://127.0.0.1:4000`.
- Mobile: copy `apps/mobile/.env.example` to `apps/mobile/.env`; set `EXPO_PUBLIC_API_URL`. Use `10.0.2.2` for an Android emulator, the simulator's host address where appropriate, or the computer's LAN IP for a physical phone. A phone cannot reach the computer using its own `127.0.0.1`.
- Add the web origin to backend `APP_ORIGINS`. Keep provider credentials only in the backend environment.

Mobile bearer tokens use Expo SecureStore. Web tokens stay in the current browser session. Patient and clinical state is fetched from the API and is not written to browser localStorage or mobile AsyncStorage.

## Database setup after the database service is running

From `backend`, run `npm run migrate`, then start the API. This applies migrations `002_patient_requests.sql` through `006_password_auth.sql`, including history requests, verified phone changes, staff collaboration, pharmacy inventory/prescription directions, and password credentials/staff MFA.

Patients can use OTP or passphrase sign-in. Registration verifies the phone and creates a passphrase; existing accounts can set/reset one after phone OTP verification. Staff use passphrase plus OTP. Passwords are stored as salted scrypt hashes; resetting a passphrase revokes existing sessions. The local console OTP provider prints codes only in development.

## Provider-backed behavior

The UI calls the M-Pesa, SMS/OTP, and WhatsApp server routes. Whether those routes contact a real provider depends on backend provider settings and valid server-side credentials. Mock M-Pesa completion is available only in non-production development mode. The catalog, its prices and pharmacy inventory are database-backed. A pharmacist records opening/received stock in the pharmacy workspace; existing catalog medicines start at zero when migration 005 is applied, so they must be stocked before dispensing. Doctors record patient-specific directions with each prescription. Appointment booking is stored by the API, but provider/doctor availability and appointment slot discovery are not integrated. There is no external drug-reference database connection yet; medicine lookup uses the local database catalog. Insurance payer pricing is not connected, and the app does not pretend those features are live.
