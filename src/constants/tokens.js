export const UI_TOKENS = {
  bgCanvas: '#F8FAFC',
  bgSurface: '#FFFFFF',
  bgSubtle: '#F1F5F9',
  borderDefault: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  brandPrimary: '#1D4ED8',
  brandPrimaryHover: '#1E40AF',
  statusSuccess: '#15803D',
  statusWarning: '#B45309',
  statusDanger: '#B91C1C',
};

export const CANVAS_STROKE_SWATCHES = [
  { label: 'Slate Gelap', value: '#0F172A' },
  { label: 'Biru Utama', value: '#1D4ED8' },
  { label: 'Hijau', value: '#15803D' },
  { label: 'Amber', value: '#B45309' },
  { label: 'Merah', value: '#B91C1C' },
  { label: 'Abu Slate', value: '#475569' },
  { label: 'Cyan', value: '#0E7490' },
];

export const CANVAS_FILL_SWATCHES = [
  { label: 'Transparan', value: 'transparent' },
  { label: 'Putih', value: '#FFFFFF' },
  { label: 'Slate Lembut', value: '#F1F5F9' },
  { label: 'Biru Lembut', value: '#DBEAFE' },
  { label: 'Hijau Lembut', value: '#DCFCE7' },
  { label: 'Amber Lembut', value: '#FEF3C7' },
  { label: 'Merah Lembut', value: '#FEE2E2' },
  { label: 'Cyan Lembut', value: '#CFFAFE' },
];

export const STROKE_WIDTH_OPTIONS = [
  { label: 'Tipis', value: 1.5 },
  { label: 'Sedang', value: 2.5 },
  { label: 'Tebal', value: 4 },
];

export const FONT_FAMILY_MAP = {
  sans: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  sketch: '"Segoe Print", "Comic Sans MS", cursive',
};

export const MARKER_OPTIONS = [
  { group: 'Umum', value: 'none', label: 'Tanpa Ujung' },
  { group: 'Umum', value: 'arrow', label: 'Panah Terbuka' },
  { group: 'Umum', value: 'filled_arrow', label: 'Panah Penuh' },
  { group: 'Umum', value: 'circle', label: 'Titik / Lingkaran' },
  { group: 'Umum', value: 'diamond', label: 'Belah Ketupat' },
  { group: 'ERD (Crow\'s Foot)', value: 'crow_one', label: 'Satu (|)' },
  { group: 'ERD (Crow\'s Foot)', value: 'crow_one_only', label: 'Tepat Satu (||)' },
  { group: 'ERD (Crow\'s Foot)', value: 'crow_zero_one', label: 'Nol atau Satu (O|)' },
  { group: 'ERD (Crow\'s Foot)', value: 'crow_many', label: 'Banyak (<)' },
  { group: 'ERD (Crow\'s Foot)', value: 'crow_one_many', label: 'Satu atau Banyak (|<)' },
  { group: 'ERD (Crow\'s Foot)', value: 'crow_zero_many', label: 'Nol atau Banyak (O<)' },
  { group: 'UML', value: 'hollow_triangle', label: 'Inheritance / Generalization' },
  { group: 'UML', value: 'hollow_diamond', label: 'Aggregation (Kosong)' },
  { group: 'UML', value: 'filled_diamond', label: 'Composition (Penuh)' },
];

export const GRID_SIZE = 20;
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;
