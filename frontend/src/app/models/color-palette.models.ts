export interface ColorPalette {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    border: string;
    link: string;
    nodeFill: string;
    nodeStroke: string;
    graphText: string;
  };
}

export type ColorPaletteId = 'default' | 'ocean' | 'forest' | 'sunset' | 'monochrome' | 'neon';

export const COLOR_PALETTES: Record<ColorPaletteId, ColorPalette> = {
  default: {
    id: 'default',
    name: 'Default',
    description: 'Classic blue theme',
    colors: {
      primary: '#3b82f6',
      secondary: '#6b7280',
      accent: '#1e40af',
      background: '#ffffff',
      text: '#111827',
      border: '#e5e7eb',
      link: '#cbd5e0',
      nodeFill: '#3b82f6',
      nodeStroke: '#1e40af',
      graphText: '#6b7280'
    }
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue ocean theme',
    colors: {
      primary: '#0ea5e9',
      secondary: '#64748b',
      accent: '#0369a1',
      background: '#ffffff',
      text: '#0f172a',
      border: '#e2e8f0',
      link: '#94a3b8',
      nodeFill: '#0ea5e9',
      nodeStroke: '#0369a1',
      graphText: '#475569'
    }
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Green nature theme',
    colors: {
      primary: '#10b981',
      secondary: '#6b7280',
      accent: '#059669',
      background: '#ffffff',
      text: '#111827',
      border: '#e5e7eb',
      link: '#d1fae5',
      nodeFill: '#10b981',
      nodeStroke: '#059669',
      graphText: '#6b7280'
    }
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange theme',
    colors: {
      primary: '#f59e0b',
      secondary: '#6b7280',
      accent: '#d97706',
      background: '#ffffff',
      text: '#111827',
      border: '#e5e7eb',
      link: '#fed7aa',
      nodeFill: '#f59e0b',
      nodeStroke: '#d97706',
      graphText: '#6b7280'
    }
  },
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Black and white theme',
    colors: {
      primary: '#374151',
      secondary: '#6b7280',
      accent: '#111827',
      background: '#ffffff',
      text: '#111827',
      border: '#e5e7eb',
      link: '#d1d5db',
      nodeFill: '#374151',
      nodeStroke: '#111827',
      graphText: '#6b7280'
    }
  },
  neon: {
    id: 'neon',
    name: 'Neon',
    description: 'Bright neon theme',
    colors: {
      primary: '#ec4899',
      secondary: '#8b5cf6',
      accent: '#06b6d4',
      background: '#ffffff',
      text: '#111827',
      border: '#e5e7eb',
      link: '#f0abfc',
      nodeFill: '#ec4899',
      nodeStroke: '#be185d',
      graphText: '#6b7280'
    }
  }
};

export const DARK_COLOR_PALETTES: Record<ColorPaletteId, ColorPalette> = {
  default: {
    id: 'default',
    name: 'Default Dark',
    description: 'Classic dark theme',
    colors: {
      primary: '#3b82f6',
      secondary: '#6b7280',
      accent: '#1e40af',
      background: '#1a1a1a',
      text: '#e0e0e0',
      border: '#404040',
      link: '#4b5563',
      nodeFill: '#3b82f6',
      nodeStroke: '#1e40af',
      graphText: '#9ca3af'
    }
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Dark',
    description: 'Deep ocean dark theme',
    colors: {
      primary: '#0ea5e9',
      secondary: '#64748b',
      accent: '#0369a1',
      background: '#0f172a',
      text: '#f1f5f9',
      border: '#334155',
      link: '#475569',
      nodeFill: '#0ea5e9',
      nodeStroke: '#0369a1',
      graphText: '#94a3b8'
    }
  },
  forest: {
    id: 'forest',
    name: 'Forest Dark',
    description: 'Dark green theme',
    colors: {
      primary: '#10b981',
      secondary: '#6b7280',
      accent: '#059669',
      background: '#064e3b',
      text: '#ecfdf5',
      border: '#065f46',
      link: '#065f46',
      nodeFill: '#10b981',
      nodeStroke: '#059669',
      graphText: '#6ee7b7'
    }
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Dark',
    description: 'Dark orange theme',
    colors: {
      primary: '#f59e0b',
      secondary: '#6b7280',
      accent: '#d97706',
      background: '#451a03',
      text: '#fef3c7',
      border: '#92400e',
      link: '#92400e',
      nodeFill: '#f59e0b',
      nodeStroke: '#d97706',
      graphText: '#fbbf24'
    }
  },
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome Dark',
    description: 'Pure black and white',
    colors: {
      primary: '#e5e7eb',
      secondary: '#9ca3af',
      accent: '#f9fafb',
      background: '#000000',
      text: '#ffffff',
      border: '#374151',
      link: '#4b5563',
      nodeFill: '#e5e7eb',
      nodeStroke: '#f9fafb',
      graphText: '#9ca3af'
    }
  },
  neon: {
    id: 'neon',
    name: 'Neon Dark',
    description: 'Bright neon on dark',
    colors: {
      primary: '#ec4899',
      secondary: '#8b5cf6',
      accent: '#06b6d4',
      background: '#0f0f23',
      text: '#ffffff',
      border: '#312e81',
      link: '#581c87',
      nodeFill: '#ec4899',
      nodeStroke: '#be185d',
      graphText: '#f0abfc'
    }
  }
};
