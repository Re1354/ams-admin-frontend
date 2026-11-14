const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.tatomal.me';

export function resolveMediaUrl(value?: string | null): string | undefined {
  const source = value?.trim();
  if (!source) return undefined;
  if (/^(https?:|data:|blob:)/i.test(source)) return source;

  try {
    return new URL(source, `${API_BASE_URL.replace(/\/$/, '')}/`).toString();
  } catch {
    return source;
  }
}
