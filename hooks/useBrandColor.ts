import { useEffect, useState } from 'react';

const BRANDFETCH_CLIENT_ID = process.env.EXPO_PUBLIC_BRANDFETCH_CLIENT_ID;

const colorCache = new Map<string, string | null>();

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return 1;
  const l1 = luminance(c1.r, c1.g, c1.b);
  const l2 = luminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function saturation(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

async function fetchBrandColor(domain: string, cardBackground: string): Promise<string | null> {
  if (!BRANDFETCH_CLIENT_ID) return null;
  try {
    const url = `https://cdn.brandfetch.io/${domain}/palette?c=${BRANDFETCH_CLIENT_ID}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json();
    const hexes: string[] = Array.isArray(json)
      ? json.map((item: any) => (typeof item === 'string' ? item : item?.hex)).filter(Boolean)
      : [];
    if (hexes.length === 0) return null;
    const candidates = hexes
      .map(hex => ({ hex, sat: saturation(hex), contrast: contrastRatio(hex, cardBackground) }))
      .filter(c => c.contrast >= 4.5)
      .sort((a, b) => b.sat - a.sat);
    if (candidates.length === 0) {
      const relaxed = hexes
        .map(hex => ({ hex, sat: saturation(hex), contrast: contrastRatio(hex, cardBackground) }))
        .filter(c => c.contrast >= 3.0)
        .sort((a, b) => b.sat - a.sat);
      return relaxed[0]?.hex ?? null;
    }
    return candidates[0].hex;
  } catch {
    return null;
  }
}

export function useBrandColor(
  domain: string | null | undefined,
  cardBackground: string,
): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!domain) { setColor(null); return; }
    const cacheKey = `${domain}::${cardBackground}`;
    if (colorCache.has(cacheKey)) {
      setColor(colorCache.get(cacheKey) ?? null);
      return;
    }
    let cancelled = false;
    fetchBrandColor(domain, cardBackground).then(result => {
      if (!cancelled) {
        colorCache.set(cacheKey, result);
        setColor(result);
      }
    });
    return () => { cancelled = true; };
  }, [domain, cardBackground]);

  return color;
}
