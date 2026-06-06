import { Injectable } from '@angular/core';
import { WrappedStats } from '../models/git.models';

/**
 * Renders a "Git Wrapped" summary card to a canvas and exports it as a PNG.
 *
 * Why a hand-rolled canvas renderer instead of html2canvas/dom-to-image?
 *  - Zero new dependencies (keeps the bundle and supply chain lean).
 *  - Deterministic output — no reliance on the page's computed styles, fonts
 *    loading at the right time, or cross-origin CSS that can taint the canvas.
 *  - Produces a fixed 1080x1350 portrait card that looks great on social feeds.
 */
@Injectable({ providedIn: 'root' })
export class WrappedCardRenderer {
  private readonly W = 1080;
  private readonly H = 1350;

  /** Render the card and return a PNG blob suitable for download or sharing. */
  async toBlob(stats: WrappedStats, repoName: string): Promise<Blob> {
    const canvas = this.render(stats, repoName);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
        'image/png',
      );
    });
  }

  /** Render to a data URL (useful for <img> previews). */
  toDataUrl(stats: WrappedStats, repoName: string): string {
    return this.render(stats, repoName).toDataURL('image/png');
  }

  private render(stats: WrappedStats, repoName: string): HTMLCanvasElement {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = this.W * dpr;
    canvas.height = this.H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.scale(dpr, dpr);

    this.drawBackground(ctx);

    const pad = 80;
    let y = 120;

    // Header
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('⎇  GIT WRAPPED', pad, y);

    y += 86;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 120px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(stats.label, pad, y);

    y += 52;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '500 34px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(this.truncate(ctx, repoName, this.W - pad * 2), pad, y);

    // Big stat tiles
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
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 60px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(value, tx + 32, ty + 78);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '500 26px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(label, tx + 32, ty + 118);
    });
    y += tileH * 2 + 24 + 70;

    // Top contributors
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '700 24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('TOP CONTRIBUTORS', pad, y);
    y += 44;
    const top = stats.topContributors.slice(0, 3);
    const maxCommits = top[0]?.commits || 1;
    top.forEach((c, i) => {
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 30px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`${i + 1}. ${this.truncate(ctx, c.author, 520)}`, pad, y + 30);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'right';
      ctx.fillText(`${c.commits}`, this.W - pad, y + 30);
      ctx.textAlign = 'left';
      // bar
      const barY = y + 46;
      this.roundRect(ctx, pad, barY, this.W - pad * 2, 10, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fill();
      this.roundRect(ctx, pad, barY, (this.W - pad * 2) * (c.commits / maxCommits), 10, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      y += 78;
    });

    y += 30;

    // Fun stats row
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
    ctx.font = '500 30px ui-sans-serif, system-ui, sans-serif';
    funStats.forEach(([emoji, text]) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(emoji, pad, y + 30);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(text, pad + 56, y + 30);
      y += 56;
    });

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('made with git-history-ui · npx git-history-ui', pad, this.H - 70);

    return canvas;
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, this.W, this.H);
    g.addColorStop(0, '#6d28d9');
    g.addColorStop(0.5, '#7c3aed');
    g.addColorStop(1, '#2563eb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);

    // soft glow accents
    const glow = ctx.createRadialGradient(this.W * 0.85, 120, 0, this.W * 0.85, 120, 520);
    glow.addColorStop(0, 'rgba(236,72,153,0.35)');
    glow.addColorStop(1, 'rgba(236,72,153,0)');
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
