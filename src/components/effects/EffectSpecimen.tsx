import { memo } from "react";
import type { EffectRegistryEntry } from "@/engine/effectRegistry";

type EffectSpecimenProps = {
  effect: EffectRegistryEntry;
  large?: boolean;
  className?: string;
};

type Family = "signal" | "spectrum" | "fluid" | "radial" | "grain" | "contour" | "depth" | "field";

type SpecimenConfig = {
  family: Family;
  seed: number;
  signature: string;
  colors: [string, string, string];
  values: number[];
};

const PALETTES: Record<string, [string, string, string]> = {
  corruption: ["#ff2ca8", "#e9ff46", "#31d8ff"],
  color: ["#ff334f", "#45f0ff", "#f5dc35"],
  geometry: ["#e9ff46", "#ff2ca8", "#f2efe6"],
  atmosphere: ["#4ae6c8", "#a678ff", "#f2efe6"],
  dimension: ["#ff6b35", "#31d8ff", "#e9ff46"],
};

const CONFIG_CACHE = new Map<string, SpecimenConfig>();

function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chooseFamily(effect: EffectRegistryEntry): Family {
  const key = `${effect.id} ${effect.name}`.toLowerCase();
  if (/rgb|chroma|hue|rainbow|thermal|duotone|palette|solar|prism|anaglyph|infrared|holo|oil/.test(key)) return "spectrum";
  if (/liquid|melt|ripple|twirl|warp|flow|caustic|water|acrylic|turbulence|smear/.test(key)) return "fluid";
  if (/kaleido|polar|mandala|moire|shockwave|bloom|god.?ray|shaft|flare|zoom/.test(key)) return "radial";
  if (/grain|noise|static|dust|ember|dither|ascii|bit|photocopy|halftone|hatch/.test(key)) return "grain";
  if (/contour|topo|neon|emboss|relief|crystal|glass|voronoi|shatter|hex/.test(key)) return "contour";
  if (/depth|dimension|tunnel|perspective|parallax|extrude|strata|refract|teleport|time/.test(key)) return "depth";
  if (/sort|mosh|block|tear|jitter|scan|smear|slice|buffer|vhs|crt|shutter|echo|trail|freeze|break/.test(key)) return "signal";
  return "field";
}

function getConfig(effect: EffectRegistryEntry): SpecimenConfig {
  const cached = CONFIG_CACHE.get(effect.id);
  if (cached) return cached;
  const seed = hashText(`${effect.id}:${effect.category}:${effect.params.length}`);
  let state = seed || 1;
  const values = Array.from({ length: 42 }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967295;
  });
  const family = chooseFamily(effect);
  const config = {
    family,
    seed,
    signature: `${family}-${seed.toString(16)}`,
    colors: PALETTES[effect.category] ?? PALETTES.corruption,
    values,
  };
  CONFIG_CACHE.set(effect.id, config);
  return config;
}

function Signal({ c, v, dense }: { c: string[]; v: number[]; dense: boolean }) {
  const count = dense ? 22 : 13;
  return <>
    {Array.from({ length: count }, (_, i) => {
      const y = 7 + i * (86 / count);
      const shift = (v[i] - 0.5) * 42;
      const width = 48 + v[i + 8] * 105;
      return <rect key={i} x={-10 + shift} y={y} width={width} height={1.5 + v[i + 16] * 5} fill={c[i % 3]} opacity={0.35 + v[i + 3] * 0.65} />;
    })}
    <rect x={18 + v[2] * 45} y="15" width="4" height="70" fill={c[1]} opacity=".8" />
  </>;
}

function Spectrum({ c, v, dense }: { c: string[]; v: number[]; dense: boolean }) {
  const count = dense ? 12 : 8;
  return <>
    {Array.from({ length: count }, (_, i) => {
      const x = -12 + i * (190 / (count - 1));
      const slant = (v[i] - 0.5) * 30;
      return <polygon key={i} points={`${x},100 ${x + 20 + slant},0 ${x + 43 + slant},0 ${x + 20},100`} fill={c[i % 3]} opacity={0.22 + v[i + 9] * 0.7} />;
    })}
    <circle cx={35 + v[3] * 90} cy={24 + v[4] * 52} r={9 + v[5] * 20} fill="none" stroke={c[0]} strokeWidth="3" />
  </>;
}

function Fluid({ c, v, dense }: { c: string[]; v: number[]; dense: boolean }) {
  const count = dense ? 13 : 8;
  return <>
    {Array.from({ length: count }, (_, i) => {
      const y = 8 + i * (84 / (count - 1));
      const bend = 14 + v[i] * 42;
      const reverse = i % 2 ? -1 : 1;
      return <path key={i} d={`M -8 ${y} C ${35 + bend * reverse} ${y - 22}, ${105 - bend * reverse} ${y + 22}, 168 ${y - 3}`} fill="none" stroke={c[i % 3]} strokeWidth={1.2 + v[i + 13] * 3.8} opacity={0.45 + v[i + 4] * 0.5} />;
    })}
  </>;
}

function Radial({ c, v, dense }: { c: string[]; v: number[]; dense: boolean }) {
  const count = dense ? 18 : 11;
  const cx = 55 + v[0] * 50;
  const cy = 35 + v[1] * 30;
  return <>
    {Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + v[2] * 0.6;
      const inner = 7 + (i % 3) * 4;
      const outer = 60 + v[i + 5] * 55;
      return <line key={i} x1={cx + Math.cos(angle) * inner} y1={cy + Math.sin(angle) * inner} x2={cx + Math.cos(angle) * outer} y2={cy + Math.sin(angle) * outer} stroke={c[i % 3]} strokeWidth={1 + v[i + 12] * 3} opacity={0.42 + v[i + 3] * 0.52} />;
    })}
    {[1, 2, 3].map((ring) => <ellipse key={ring} cx={cx} cy={cy} rx={ring * (10 + v[ring] * 7)} ry={ring * (7 + v[ring + 4] * 5)} fill="none" stroke={c[ring % 3]} strokeWidth="1.5" />)}
  </>;
}

function Grain({ c, v, dense }: { c: string[]; v: number[]; dense: boolean }) {
  const count = dense ? 42 : 24;
  return <>
    {Array.from({ length: count }, (_, i) => {
      const x = v[i % 42] * 160;
      const y = v[(i * 7 + 3) % 42] * 100;
      const size = 1 + v[(i * 11 + 5) % 42] * (dense ? 9 : 7);
      return i % 3 === 0
        ? <rect key={i} x={x} y={y} width={size * 1.8} height={size} fill={c[i % 3]} opacity={0.35 + v[(i + 8) % 42] * 0.65} />
        : <circle key={i} cx={x} cy={y} r={size / 2} fill={c[i % 3]} opacity={0.35 + v[(i + 8) % 42] * 0.65} />;
    })}
  </>;
}

function Contour({ c, v, dense }: { c: string[]; v: number[]; dense: boolean }) {
  const count = dense ? 14 : 9;
  const cx = 70 + (v[0] - 0.5) * 30;
  const cy = 48 + (v[1] - 0.5) * 20;
  return <>
    {Array.from({ length: count }, (_, i) => {
      const radius = 7 + i * (54 / count);
      const skew = (v[i + 4] - 0.5) * 18;
      return <path key={i} d={`M ${cx - radius} ${cy} Q ${cx - radius / 2} ${cy - radius - skew}, ${cx} ${cy - radius * .55} T ${cx + radius} ${cy} Q ${cx + radius / 2} ${cy + radius + skew}, ${cx} ${cy + radius * .55} T ${cx - radius} ${cy}`} fill="none" stroke={c[i % 3]} strokeWidth={1 + v[i + 15] * 2.2} opacity={0.45 + v[i + 2] * 0.5} />;
    })}
  </>;
}

function Depth({ c, v, dense }: { c: string[]; v: number[]; dense: boolean }) {
  const count = dense ? 14 : 9;
  const vanX = 45 + v[0] * 70;
  const vanY = 25 + v[1] * 45;
  return <>
    {Array.from({ length: count }, (_, i) => {
      const y = i * (100 / (count - 1));
      const edge = i % 2 ? 160 : 0;
      return <line key={i} x1={vanX} y1={vanY} x2={edge} y2={y} stroke={c[i % 3]} strokeWidth={1 + v[i + 4] * 2.4} opacity={0.45 + v[i + 8] * 0.5} />;
    })}
    {[0, 1, 2, 3].map(i => <rect key={i} x={vanX - 9 - i * 10} y={vanY - 6 - i * 7} width={18 + i * 20} height={12 + i * 14} fill="none" stroke={c[(i + 1) % 3]} strokeWidth="1.5" opacity={1 - i * .15} />)}
  </>;
}

function Field({ c, v, dense }: { c: string[]; v: number[]; dense: boolean }) {
  const count = dense ? 20 : 12;
  return <>
    {Array.from({ length: count }, (_, i) => {
      const x = v[i] * 145;
      const y = v[i + 9] * 88;
      const w = 8 + v[i + 17] * 46;
      const h = 5 + v[(i + 25) % 42] * 26;
      return <rect key={i} x={x - w / 2} y={y - h / 2} width={w} height={h} fill={i % 2 ? "none" : c[i % 3]} stroke={c[(i + 1) % 3]} strokeWidth={1.2 + v[i + 2] * 2} opacity={0.35 + v[i + 6] * 0.58} transform={`rotate(${(v[i + 12] - .5) * 55} ${x} ${y})`} />;
    })}
  </>;
}

export const EffectSpecimen = memo(function EffectSpecimen({ effect, large = false, className = "" }: EffectSpecimenProps) {
  const config = getConfig(effect);
  const props = { c: config.colors, v: config.values, dense: large };
  return (
    <svg
      className={className}
      viewBox="0 0 160 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-specimen-signature={config.signature}
    >
      <rect width="160" height="100" fill="#050505" />
      <path d={`M0 ${18 + config.values[38] * 62}H160`} stroke="#f2efe6" strokeWidth=".5" opacity=".25" />
      {config.family === "signal" && <Signal {...props} />}
      {config.family === "spectrum" && <Spectrum {...props} />}
      {config.family === "fluid" && <Fluid {...props} />}
      {config.family === "radial" && <Radial {...props} />}
      {config.family === "grain" && <Grain {...props} />}
      {config.family === "contour" && <Contour {...props} />}
      {config.family === "depth" && <Depth {...props} />}
      {config.family === "field" && <Field {...props} />}
      <rect x="3" y="3" width="154" height="94" fill="none" stroke={config.colors[1]} strokeWidth=".65" opacity=".45" />
    </svg>
  );
});
