import { config } from '../config.js';

export async function sendOtp(phone, code, ttlSeconds) {
  const message = `Your MediFlow verification code is ${code}. It expires in ${Math.ceil(ttlSeconds / 60)} minutes. Never share this code.`;
  if (config.otpProvider === 'console') {
    if (config.nodeEnv === 'production') throw new Error('Console OTP is disabled in production.');
    console.info(`[DEV OTP] ${phone}: ${code}`);
    return { provider: 'console' };
  }
  if (config.otpProvider !== 'africas-talking') throw new Error('Unsupported OTP_PROVIDER.');
  if (!config.atUsername || !config.atApiKey) throw new Error('Africa\'s Talking requires AT_USERNAME and AT_API_KEY.');
  const url = config.atEnv === 'sandbox' ? 'https://api.sandbox.africastalking.com/version1/messaging' : 'https://api.africastalking.com/version1/messaging';
  const body = new URLSearchParams({ username: config.atUsername, to: phone, message });
  if (config.atSenderId) body.set('from', config.atSenderId);
  const response = await fetch(url, { method: 'POST', headers: { apiKey: config.atApiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Africa's Talking SMS request failed (${response.status}).`);
  const result = await response.json();
  if (!result.SMSMessageData?.Recipients?.some(recipient => recipient.statusCode === 101 || recipient.status === 'Success')) throw new Error('Africa\'s Talking did not accept the OTP message.');
  return { provider: 'africas-talking' };
}
