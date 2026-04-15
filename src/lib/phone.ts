export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizePhone(phone: string): string {
  const clean = cleanPhone(phone);
  return clean.startsWith("55") ? clean : `55${clean}`;
}

export function formatPhoneDisplay(phone: string): string {
  const clean = cleanPhone(phone);
  const num = clean.startsWith("55") ? clean.slice(2) : clean;
  if (num.length === 11) return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`;
  if (num.length === 10) return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`;
  return phone;
}

export function buildWhatsAppUrl(phone: string, message?: string): string {
  const normalized = normalizePhone(phone);
  const url = `https://wa.me/${normalized}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

export function phoneVariants(phone: string): string[] {
  const clean = cleanPhone(phone);
  const with55 = clean.startsWith("55") ? clean : `55${clean}`;
  const without55 = clean.startsWith("55") ? clean.slice(2) : clean;
  return [with55, without55];
}
