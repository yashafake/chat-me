export function safeTrim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

export function normalizeOrigins(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeOrigin).filter(Boolean)));
}

export function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

export function sanitizePlainText(value: string): string {
  return clampText(
    value
      .replace(/\r\n/g, "\n")
      .replace(/\u0000/g, "")
      .replace(/[<>]/g, "")
      .trim(),
    4_000
  );
}

export function pickLocale(value: string | null | undefined): "ru" | "en" {
  return value === "en" ? "en" : "ru";
}

export function asArray<T>(value: T | T[] | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined ? [] : [value];
}
