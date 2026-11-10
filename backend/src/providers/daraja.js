import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const baseUrl = config.mpesaEnv === 'sandbox' ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
let cachedToken = null;
let tokenExpiresAt = 0;
const formatStamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}${value.hour}${value.minute}${value.second}`;
};
async function accessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  if (!config.mpesaConsumerKey || !config.mpesaConsumerSecret) throw new Error('Daraja credentials are not configured.');
  const auth = Buffer.from(`${config.mpesaConsumerKey}:${config.mpesaConsumerSecret}`).toString('base64');
  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Daraja OAuth failed (${response.status}).`);
  const data = await response.json(); cachedToken = data.access_token; tokenExpiresAt = Date.now() + Math.max(10, Number(data.expires_in ?? 3599) - 60) * 1000;
  if (!cachedToken) throw new Error('Daraja OAuth response did not include an access token.');
  return cachedToken;
}
async function post(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Daraja request failed (${response.status}): ${result.errorMessage ?? result.ResponseDescription ?? 'provider error'}`);
  return result;
}
function stkCredentials(timestamp) {
  if (!config.mpesaShortCode || !config.mpesaPasskey) throw new Error('Daraja shortcode and passkey are not configured.');
  const password = Buffer.from(`${config.mpesaShortCode}${config.mpesaPasskey}${timestamp}`).toString('base64');
  return { timestamp, password };
}
export async function initiateStk({ phone, amountKes, reference, description }) {
  if (!Number.isSafeInteger(amountKes) || amountKes <= 0) throw new RangeError('M-Pesa amount must be a positive whole KES value.');
  if (!config.mpesaCallbackUrl?.startsWith('https://')) throw new Error('MPESA_CALLBACK_URL must be a public HTTPS address.');
  const timestamp = formatStamp(); const { password } = stkCredentials(timestamp);
  const msisdn = phone.replace(/^\+/, '');
  return post('/mpesa/stkpush/v1/processrequest', {
    BusinessShortCode: config.mpesaShortCode, Password: password, Timestamp: timestamp,
    TransactionType: config.mpesaTransactionType, Amount: amountKes, PartyA: msisdn,
    PartyB: config.mpesaShortCode, PhoneNumber: msisdn, CallBackURL: config.mpesaCallbackUrl,
    AccountReference: reference.slice(0, 12), TransactionDesc: description.slice(0, 13),
  });
}
export async function queryStk(checkoutRequestId) {
  const timestamp = formatStamp(); const { password } = stkCredentials(timestamp);
  return post('/mpesa/stkpushquery/v1/query', { BusinessShortCode: config.mpesaShortCode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId });
}
export function verifyWhatsAppSignature(rawBody, signature) {
  if (!config.whatsappAppSecret || !signature?.startsWith('sha256=')) return false;
  const actual = `sha256=${createHmac('sha256', config.whatsappAppSecret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(actual); const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
