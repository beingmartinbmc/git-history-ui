import { Injectable } from '@angular/core';
import { WrappedStats } from '../models/git.models';

/**
 * A color scheme for the Git Wrapped card. Every color used by the renderer is
 * parameterized here so palettes can range from dark/vivid to light/paper
 * without the layout code needing to know which is which.
 */
export interface WrappedPalette {
  id: string;
  name: string;
  /** Three gradient stops painted top-left → bottom-right. */
  stops: [string, string, string];
  /** Radial accent glow color (with alpha). */
  glow: string;
  /** Primary text color. */
  ink: string;
  /** Muted/secondary text color. */
  inkSoft: string;
  /** Faint label text color. */
  inkFaint: string;
  /** Tile / panel fill. */
  tile: string;
  /** Progress-bar track color. */
  line: string;
  /** Progress-bar fill / highlight accent. */
  accent: string;
}

/** The visual layout of the card. Palettes are orthogonal to templates. */
export type WrappedTemplateId = 'classic' | 'minimal' | 'bold';

export interface WrappedTemplate {
  id: WrappedTemplateId;
  name: string;
  description: string;
}

export interface WrappedCardOptions {
  template?: WrappedTemplateId;
  paletteId?: string;
}

export const WRAPPED_PALETTES: readonly WrappedPalette[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    stops: ['#6d28d9', '#7c3aed', '#2563eb'],
    glow: 'rgba(236,72,153,0.35)',
    ink: '#ffffff',
    inkSoft: 'rgba(255,255,255,0.78)',
    inkFaint: 'rgba(255,255,255,0.6)',
    tile: 'rgba(255,255,255,0.08)',
    line: 'rgba(255,255,255,0.14)',
    accent: '#ffffff',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    stops: ['#f97316', '#db2777', '#7c3aed'],
    glow: 'rgba(250,204,21,0.4)',
    ink: '#ffffff',
    inkSoft: 'rgba(255,255,255,0.82)',
    inkFaint: 'rgba(255,255,255,0.66)',
    tile: 'rgba(255,255,255,0.12)',
    line: 'rgba(255,255,255,0.18)',
    accent: '#fde68a',
  },
  {
    id: 'forest',
    name: 'Forest',
    stops: ['#064e3b', '#047857', '#0d9488'],
    glow: 'rgba(163,230,53,0.35)',
    ink: '#ffffff',
    inkSoft: 'rgba(255,255,255,0.8)',
    inkFaint: 'rgba(255,255,255,0.62)',
    tile: 'rgba(255,255,255,0.1)',
    line: 'rgba(255,255,255,0.16)',
    accent: '#bbf7d0',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    stops: ['#020617', '#0f172a', '#1e293b'],
    glow: 'rgba(56,189,248,0.3)',
    ink: '#e2e8f0',
    inkSoft: 'rgba(226,232,240,0.72)',
    inkFaint: 'rgba(148,163,184,0.7)',
    tile: 'rgba(148,163,184,0.12)',
    line: 'rgba(148,163,184,0.18)',
    accent: '#38bdf8',
  },
  {
    id: 'candy',
    name: 'Candy',
    stops: ['#ec4899', '#f43f5e', '#fb923c'],
    glow: 'rgba(255,255,255,0.4)',
    ink: '#ffffff',
    inkSoft: 'rgba(255,255,255,0.85)',
    inkFaint: 'rgba(255,255,255,0.7)',
    tile: 'rgba(255,255,255,0.16)',
    line: 'rgba(255,255,255,0.22)',
    accent: '#ffffff',
  },
  {
    id: 'paper',
    name: 'Paper',
    stops: ['#f8fafc', '#eef2f7', '#dbe2ea'],
    glow: 'rgba(124,58,237,0.18)',
    ink: '#0f172a',
    inkSoft: 'rgba(15,23,42,0.7)',
    inkFaint: 'rgba(15,23,42,0.5)',
    tile: 'rgba(15,23,42,0.05)',
    line: 'rgba(15,23,42,0.1)',
    accent: '#7c3aed',
  },
];

export const WRAPPED_TEMPLATES: readonly WrappedTemplate[] = [
  { id: 'classic', name: 'Classic', description: 'Stats, contributors and highlights' },
  { id: 'minimal', name: 'Minimal', description: 'One big number, clean and centered' },
  { id: 'bold', name: 'Bold', description: 'Oversized stat tiles front and center' },
];

const DEFAULT_PALETTE = WRAPPED_PALETTES[0];
const DEFAULT_TEMPLATE: WrappedTemplateId = 'classic';

/**
 * Renders a "Git Wrapped" summary card to a canvas and exports it as a PNG.
 *
 * Why a hand-rolled canvas renderer instead of html2canvas/dom-to-image?
 *  - Zero new dependencies (keeps the bundle and supply chain lean).
 *  - Deterministic output — no reliance on the page's computed styles, fonts
 *    loading at the right time, or cross-origin CSS that can taint the canvas.
 *  - Deterministic output — no reliance on the page's computed styles, fonts
 *    loading at the right time, or cross-origin CSS that can taint the canvas.
 *  - Produces a fixed 1080x1350 portrait card that looks great on social feeds.
 *
 * Users can pick a layout {@link WrappedTemplate} and a color scheme
 * {@link WrappedPalette}; the two are orthogonal so any template renders with
 * any palette.
 */
@Injectable({ providedIn: 'root' })
export class WrappedCardRenderer {
  private readonly W = 1080;
  private readonly H = 1350;
  private readonly FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';

  /** Render the card and return a PNG blob suitable for download or sharing. */
  async toBlob(stats: WrappedStats, repoName: string, options?: WrappedCardOptions): Promise<Blob> {
    const canvas = this.render(stats, repoName, options);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
        'image/png',
      );
    });
  }

  /** Render to a data URL (useful for <img> previews). */
  toDataUrl(stats: WrappedStats, repoName: string, options?: WrappedCardOptions): string {
    return this.render(stats, repoName, options).toDataURL('image/png');
  }

  resolvePalette(id?: string): WrappedPalette {
    return WRAPPED_PALETTES.find((p) => p.id === id) ?? DEFAULT_PALETTE;
  }

  resolveTemplate(id?: string): WrappedTemplateId {
    return WRAPPED_TEMPLATES.find((t) => t.id === id)?.id ?? DEFAULT_TEMPLATE;
  }

  private render(
    stats: WrappedStats,
    repoName: string,
    options?: WrappedCardOptions,
  ): HTMLCanvasElement {
    const palette = this.resolvePalette(options?.paletteId);
    const template = this.resolveTemplate(options?.template);

    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = this.W * dpr;
    canvas.height = this.H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.scale(dpr, dpr);
    ctx.textBaseline = 'alphabetic';

    this.drawBackground(ctx, palette);

    switch (template) {
      case 'minimal':
        this.renderMinimal(ctx, stats, repoName, palette);
        break;
      case 'bold':
        this.renderBold(ctx, stats, repoName, palette);
        break;
      default:
        this.renderClassic(ctx, stats, repoName, palette);
    }

    this.drawFooter(ctx, palette, template === 'minimal');
    return canvas;
  }

  // ── Templates ──────────────────────────────────────────────────────────

  private renderClassic(
    ctx: CanvasRenderingContext2D,
    stats: WrappedStats,
    repoName: string,
    p: WrappedPalette,
  ): void {
    const pad = 80;
    let y = 120;

    ctx.fillStyle = p.inkSoft;
    ctx.font = `600 28px ${this.FONT}`;
    ctx.fillText('⎇  GIT WRAPPED', pad, y);

    y += 86;
    ctx.fillStyle = p.ink;
    ctx.font = `800 120px ${this.FONT}`;
    ctx.fillText(stats.label, pad, y);

    y += 52;
    ctx.fillStyle = p.inkSoft;
    ctx.font = `500 34px ${this.FONT}`;
    ctx.fillText(this.truncate(ctx, repoName, this.W - pad * 2), pad, y);

    y += 70;
    const tiles: Array<[string, string]> = [
      [this.formatNumber(stats.totalCommits), 'commits'],
      [this.formatNumber(stats.totalAuthors), 'contributors'],
      [this.formatNumber(stats.totalFilesTouched), 'files touched'],
      [`+${this.formatNumber(stats.totalAdditions)}`, 'lines added'],
    ];
    const tileW = (this.W - pad * 2 - 30) / 2;
    const tileH = 150;
    tiles.forEach(([value, label], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tx = pad + col * (tileW + 30);
      const ty = y + row * (tileH + 24);
      this.roundRect(ctx, tx, ty, tileW, tileH, 24);
      ctx.fillStyle = p.tile;
      ctx.fill();
      ctx.fillStyle = p.ink;
      ctx.font = `800 60px ${this.FONT}`;
      ctx.fillText(value, tx + 32, ty + 78);
      ctx.fillStyle = p.inkFaint;
      ctx.font = `500 26px ${this.FONT}`;
      ctx.fillText(label, tx + 32, ty + 118);
    });
    y += tileH * 2 + 24 + 70;

    ctx.fillStyle = p.inkFaint;
    ctx.font = `700 24px ${this.FONT}`;
    ctx.fillText('TOP CONTRIBUTORS', pad, y);
    y += 44;
    const top = stats.topContributors.slice(0, 3);
    const maxCommits = top[0]?.commits || 1;
    top.forEach((c, i) => {
      ctx.fillStyle = p.ink;
      ctx.font = `600 30px ${this.FONT}`;
      ctx.fillText(`${i + 1}. ${this.truncate(ctx, c.author, 520)}`, pad, y + 30);
      ctx.fillStyle = p.inkFaint;
      ctx.textAlign = 'right';
      ctx.fillText(`${c.commits}`, this.W - pad, y + 30);
      ctx.textAlign = 'left';
      const barY = y + 46;
      this.roundRect(ctx, pad, barY, this.W - pad * 2, 10, 5);
      ctx.fillStyle = p.line;
      ctx.fill();
      this.roundRect(ctx, pad, barY, (this.W - pad * 2) * (c.commits / maxCommits), 10, 5);
      ctx.fillStyle = p.accent;
      ctx.fill();
      y += 78;
    });

    y += 30;
    this.drawFunStats(ctx, stats, p, pad, y);
  }

  private renderMinimal(
    ctx: CanvasRenderingContext2D,
    stats: WrappedStats,
    repoName: string,
    p: WrappedPalette,
  ): void {
    const cx = this.W / 2;
    ctx.textAlign = 'center';

    ctx.fillStyle = p.inkFaint;
    ctx.font = `600 30px ${this.FONT}`;
    ctx.fillText('⎇  GIT WRAPPED', cx, 360);

    ctx.fillStyle = p.ink;
    ctx.font = `800 220px ${this.FONT}`;
    ctx.fillText(stats.label, cx, 560);

    ctx.fillStyle = p.inkSoft;
    ctx.font = `500 38px ${this.FONT}`;
    ctx.fillText(this.truncate(ctx, repoName, this.W - 160), cx, 640);

    const accentY = 690;
    this.roundRect(ctx, cx - 60, accentY, 120, 8, 4);
    ctx.fillStyle = p.accent;
    ctx.fill();

    const inline: Array<[string, string]> = [
      [this.formatNumber(stats.totalCommits), 'commits'],
      [this.formatNumber(stats.totalAuthors), 'contributors'],
      [`${stats.superlatives.longestStreakDays}d`, 'streak'],
    ];
    const colW = this.W / 3;
    const rowY = 880;
    inline.forEach(([value, label], i) => {
      const x = colW * i + colW / 2;
      ctx.fillStyle = p.ink;
      ctx.font = `800 76px ${this.FONT}`;
      ctx.fillText(value, x, rowY);
      ctx.fillStyle = p.inkFaint;
      ctx.font = `500 28px ${this.FONT}`;
      ctx.fillText(label, x, rowY + 48);
    });

    const top = stats.topContributors[0];
    if (top) {
      ctx.fillStyle = p.inkFaint;
      ctx.font = `700 24px ${this.FONT}`;
      ctx.fillText('TOP CONTRIBUTOR', cx, 1080);
      ctx.fillStyle = p.ink;
      ctx.font = `600 44px ${this.FONT}`;
      ctx.fillText(this.truncate(ctx, top.author, this.W - 160), cx, 1136);
    }

    ctx.textAlign = 'left';
  }

  private renderBold(
    ctx: CanvasRenderingContext2D,
    stats: WrappedStats,
    repoName: string,
    p: WrappedPalette,
  ): void {
    const pad = 80;
    let y = 130;

    ctx.fillStyle = p.inkSoft;
    ctx.font = `600 28px ${this.FONT}`;
    ctx.fillText('⎇  GIT WRAPPED', pad, y);

    y += 70;
    ctx.fillStyle = p.ink;
    ctx.font = `800 84px ${this.FONT}`;
    ctx.fillText(stats.label, pad, y);
    ctx.fillStyle = p.inkSoft;
    ctx.font = `500 30px ${this.FONT}`;
    ctx.fillText(this.truncate(ctx, repoName, this.W - pad * 2), pad, y + 44);

    y += 110;
    const tiles: Array<[string, string]> = [
      [this.formatNumber(stats.totalCommits), 'commits'],
      [this.formatNumber(stats.totalAuthors), 'contributors'],
      [`+${this.formatNumber(stats.totalAdditions)}`, 'lines added'],
      [`${stats.nightOwlPercent}%`, 'night-owl commits'],
    ];
    const gap = 28;
    const tileW = (this.W - pad * 2 - gap) / 2;
    const tileH = 340;
    tiles.forEach(([value, label], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tx = pad + col * (tileW + gap);
      const ty = y + row * (tileH + gap);
      this.roundRect(ctx, tx, ty, tileW, tileH, 32);
      ctx.fillStyle = p.tile;
      ctx.fill();
      ctx.fillStyle = p.accent;
      this.roundRect(ctx, tx + 36, ty + 40, 56, 8, 4);
      ctx.fill();
      ctx.fillStyle = p.ink;
      ctx.font = `800 110px ${this.FONT}`;
      ctx.fillText(this.truncate(ctx, value, tileW - 72), tx + 36, ty + 200);
      ctx.fillStyle = p.inkFaint;
      ctx.font = `500 30px ${this.FONT}`;
      ctx.fillText(this.truncate(ctx, label, tileW - 72), tx + 36, ty + 256);
    });
  }

  // ── Shared drawing helpers ───────────────────────────────────────────────

  private drawFunStats(
    ctx: CanvasRenderingContext2D,
    stats: WrappedStats,
    p: WrappedPalette,
    pad: number,
    startY: number,
  ): void {
    let y = startY;
    const funStats: Array<[string, string]> = [
      ['🌙', `${stats.nightOwlPercent}% night-owl commits`],
      ['🛋️', `${stats.weekendWarriorPercent}% on weekends`],
      ['🔥', `${stats.superlatives.longestStreakDays}-day longest streak`],
    ];
    if (stats.superlatives.busiestHour) {
      funStats.push([
        '⏰',
        `peak hour ${String(stats.superlatives.busiestHour.hour).padStart(2, '0')}:00`,
      ]);
    }
    ctx.font = `500 30px ${this.FONT}`;
    funStats.forEach(([emoji, text]) => {
      ctx.fillStyle = p.ink;
      ctx.fillText(emoji, pad, y + 30);
      ctx.fillStyle = p.inkSoft;
      ctx.fillText(text, pad + 56, y + 30);
      y += 56;
    });
  }

  private drawFooter(ctx: CanvasRenderingContext2D, p: WrappedPalette, centered: boolean): void {
    ctx.fillStyle = p.inkFaint;
    ctx.font = `500 24px ${this.FONT}`;
    const text = 'made with git-history-ui · npx git-history-ui';
    if (centered) {
      ctx.textAlign = 'center';
      ctx.fillText(text, this.W / 2, this.H - 70);
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(text, 80, this.H - 70);
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D, p: WrappedPalette): void {
    const g = ctx.createLinearGradient(0, 0, this.W, this.H);
    g.addColorStop(0, p.stops[0]);
    g.addColorStop(0.5, p.stops[1]);
    g.addColorStop(1, p.stops[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);

    const glow = ctx.createRadialGradient(this.W * 0.85, 120, 0, this.W * 0.85, 120, 520);
    glow.addColorStop(0, p.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  private truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
      t = t.slice(0, -1);
    }
    return `${t}…`;
  }

  private formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }
}
