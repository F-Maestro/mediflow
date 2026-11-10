import { config } from '../config.js';

export async function sendWhatsAppText(phone, text) {
  if (config.whatsappProvider === 'mock') {
    if (config.nodeEnv === 'production') throw new Error('Mock WhatsApp is disabled in production.');
    console.info('[DEV WHATSAPP] message accepted by mock provider; no content is logged.');
    return { messageId: `mock-${Date.now()}` };
  }
  if (config.whatsappProvider !== 'cloud') throw new Error('Unsupported WHATSAPP_PROVIDER.');
  if (!config.whatsappPhoneNumberId || !config.whatsappAccessToken) throw new Error('WhatsApp Cloud credentials are not configured.');
  const endpoint = `https://graph.facebook.com/${config.whatsappGraphVersion}/${config.whatsappPhoneNumberId}/messages`;
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${config.whatsappAccessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone.replace(/^\+/, ''), type: 'text', text: { preview_url: false, body: text.slice(0, 4000) } }), signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`WhatsApp send failed (${response.status}): ${result.error?.message ?? 'provider error'}`);
  return { messageId: result.messages?.[0]?.id ?? null };
}
