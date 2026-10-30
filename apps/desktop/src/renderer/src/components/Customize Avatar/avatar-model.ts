export const BOT_AVATAR_COLORS = [
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
] as const;
export const AVATAR_SHAPES = [
  { id: 0, label: "Soft" },
  { id: 1, label: "Crown" },
  { id: 2, label: "Pebble" },
  { id: 3, label: "Star" },
  { id: 4, label: "Flower" },
  { id: 5, label: "Square" },
  { id: 6, label: "Heart" },
  { id: 7, label: "Shield" },
] as const;
export const AVATAR_MOTIONS = [
  { id: "float", label: "Float" },
  { id: "stretch", label: "Stretch" },
  { id: "sway", label: "Sway" },
  { id: "pulse", label: "Pulse" },
] as const;
export type AvatarMotion = (typeof AVATAR_MOTIONS)[number]["id"];
export interface AvatarConfig {
  color: string;
  shape?: number;
  motion: AvatarMotion;
}

const CUSTOM_AVATAR_PATTERN =
  /^(#[0-9a-f]{3,8})(?:::shape_(\d+))?(?:::motion_?(float|stretch|sway|pulse))?$/i;
export function parseCustomAvatar(value: string): AvatarConfig | undefined {
  const match = value.match(CUSTOM_AVATAR_PATTERN);
  if (!match) return undefined;
  return {
    color: match[1] ?? BOT_AVATAR_COLORS[0],
    ...(match[2] === undefined ? {} : { shape: Number(match[2]) % AVATAR_SHAPES.length }),
    motion: (match[3] as AvatarMotion | undefined) ?? "float",
  };
}
export function serializeCustomAvatar(config: AvatarConfig): string {
  return `${config.color}${config.shape === undefined ? "" : `::shape_${config.shape % AVATAR_SHAPES.length}`}::motion_${config.motion}`;
}
export function defaultCustomAvatar(): string {
  return serializeCustomAvatar({ color: "#3B82F6", motion: "float" });
}
export function avatarColor(color: string): { light: string; dark: string; eye: string } {
  const raw = color.replace("#", "");
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw;
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) || 0,
  );
  const adjust = (amount: number) =>
    `rgb(${channels.map((channel) => Math.max(0, Math.min(255, channel + amount))).join(", ")})`;
  return { light: adjust(42), dark: adjust(-34), eye: "hsl(var(--background))" };
}

export function avatarColorHsl(color: string): string {
  const raw = color.replace("#", "");
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw;
  const [red, green, blue] = [0, 2, 4].map(
    (offset) => (Number.parseInt(hex.slice(offset, offset + 2), 16) || 0) / 255,
  );
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(lightness * 100)}%`;
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return `${Math.round(hue * 60)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

/** Local equivalent of the shipped mascot silhouettes from the supplied avatar source. */
export const AVATAR_SHAPE_PATHS = [
  "M -43 -10 C -48 -34 -25 -49 0 -42 C 23 -49 47 -34 42 -8 C 52 17 30 43 4 40 C -24 48 -49 30 -43 -10 Z",
  "M -43 4 C -47 -20 -31 -35 -13 -34 C -8 -52 8 -52 14 -34 C 34 -37 48 -20 42 3 C 51 28 27 45 2 40 C -25 47 -49 30 -43 4 Z",
  "M -38 -19 C -24 -44 8 -47 29 -30 C 52 -12 42 20 23 35 C 1 51 -30 42 -42 17 C -48 5 -45 -8 -38 -19 Z",
  "M -45 -7 C -37 -31 -17 -37 -2 -29 C 11 -47 36 -38 38 -17 C 54 -2 42 24 23 27 C 15 47 -13 47 -23 30 C -48 29 -55 8 -45 -7 Z",
  "M -44 -28 C -18 -47 13 -45 35 -28 C 50 -12 46 19 28 35 C 6 53 -27 42 -43 21 C -54 7 -55 -15 -44 -28 Z",
  "M -42 -34 C -21 -51 18 -49 41 -29 L 42 28 C 19 48 -18 48 -42 28 Z",
  "M 0 -48 C 12 -34 31 -35 43 -22 C 31 -8 31 14 43 28 C 25 38 12 35 0 48 C -12 35 -25 38 -43 28 C -31 14 -31 -8 -43 -22 C -31 -35 -12 -34 0 -48 Z",
  "M -43 -30 C -19 -49 19 -49 43 -30 L 35 35 C 10 49 -10 49 -35 35 Z",
] as const;
type AvatarPoint = readonly [number, number];
let organicTemplates: readonly (readonly AvatarPoint[])[] | undefined;
export function avatarIdentitySeed(identity: string): number {
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) {
    hash = (hash << 5) - hash + identity.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}
export function organicAvatarPath(seed: number, phaseOffset = 0): string {
  const phase = ((seed % 360) * Math.PI) / 180 + phaseOffset;
  const family = seed % 10;
  if (!organicTemplates)
    organicTemplates = [
      [
        [-43, 22],
        [-51, 16],
        [-53, 6],
        [-49, -4],
        [-40, -12],
        [-30, -13],
        [-27, -24],
        [-18, -34],
        [-6, -36],
        [4, -32],
        [12, -42],
        [25, -45],
        [37, -38],
        [43, -27],
        [42, -17],
        [51, -11],
        [56, 0],
        [54, 12],
        [46, 20],
        [30, 24],
        [0, 25],
        [-29, 25],
      ],
      [
        [0, -52],
        [12, -35],
        [28, -17],
        [39, 2],
        [42, 21],
        [34, 38],
        [19, 49],
        [0, 52],
        [-19, 49],
        [-34, 38],
        [-42, 21],
        [-39, 2],
        [-28, -17],
        [-12, -35],
      ],
      [
        [-42, -23],
        [-27, -40],
        [-7, -46],
        [14, -40],
        [33, -27],
        [46, -8],
        [46, 14],
        [35, 34],
        [14, 46],
        [-8, 46],
        [-29, 38],
        [-43, 21],
        [-48, 0],
      ],
      Array.from({ length: 40 }, (_, i) => {
        const a = (i / 40) * Math.PI * 2,
          r = 44 + Math.cos(a * 5) * 5;
        return [Math.cos(a) * r, Math.sin(a) * r] as const;
      }),
      Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2,
          r = 43 + Math.cos(a * 6) * 7;
        return [Math.cos(a) * r, Math.sin(a) * r] as const;
      }),
      Array.from({ length: 32 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2,
          x = Math.cos(a),
          y = Math.sin(a);
        return [
          Math.sign(x) * Math.sqrt(Math.abs(x)) * 46,
          Math.sign(y) * Math.sqrt(Math.abs(y)) * 43,
        ] as const;
      }),
      [
        [0, 48],
        [-14, 36],
        [-32, 20],
        [-45, 0],
        [-43, -20],
        [-29, -36],
        [-10, -39],
        [0, -27],
        [10, -39],
        [29, -36],
        [43, -20],
        [45, 0],
        [32, 20],
        [14, 36],
      ],
      [
        [-48, 35],
        [-38, 22],
        [-34, -8],
        [-27, -31],
        [-12, -44],
        [0, -48],
        [12, -44],
        [27, -31],
        [34, -8],
        [38, 22],
        [48, 35],
        [26, 42],
        [0, 44],
        [-26, 42],
      ],
      [
        [-45, -19],
        [-28, -38],
        [-4, -46],
        [22, -41],
        [42, -25],
        [49, -2],
        [42, 23],
        [22, 42],
        [-4, 47],
        [-29, 38],
        [-46, 18],
        [-50, 0],
      ],
      [
        [-50, 0],
        [-45, -20],
        [-30, -38],
        [0, -48],
        [30, -38],
        [45, -20],
        [50, 0],
        [35, 10],
        [18, 12],
        [16, 38],
        [0, 46],
        [-16, 38],
        [-18, 12],
        [-35, 10],
      ],
    ];
  const source = organicTemplates[family] ?? organicTemplates[5]!;
  const xScale = 1 + Math.sin(phase) * 0.035;
  const yScale = 1 + Math.cos(phase) * 0.025;
  const shear = Math.sin(phase * 1.7) * 0.025;
  let points = source.map(([x, y]) => ({ x: x * xScale + y * shear, y: y * yScale }));
  const passes = family >= 3 && family <= 5 ? 1 : 2;
  for (let pass = 0; pass < passes; pass += 1)
    points = points.flatMap((point, index) => {
      const next = points[(index + 1) % points.length]!;
      return [
        { x: point.x * 0.75 + next.x * 0.25, y: point.y * 0.75 + next.y * 0.25 },
        { x: point.x * 0.25 + next.x * 0.75, y: point.y * 0.25 + next.y * 0.75 },
      ];
    });
  const round = (value: number) => Math.round(value * 100) / 100;
  let path = `M${round(points[0]!.x)} ${round(points[0]!.y)}`;
  for (let index = 0; index < points.length; index += 1) {
    const before = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const after = points[(index + 2) % points.length]!;
    path += `C${round(current.x + (next.x - before.x) / 6)} ${round(current.y + (next.y - before.y) / 6)} ${round(next.x - (after.x - current.x) / 6)} ${round(next.y - (after.y - current.y) / 6)} ${round(next.x)} ${round(next.y)}`;
  }
  return `${path}Z`;
}
