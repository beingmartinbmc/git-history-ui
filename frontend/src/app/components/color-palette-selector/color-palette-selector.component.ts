import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ColorPalette, COLOR_PALETTES, DARK_COLOR_PALETTES, ColorPaletteId } from '../../models/color-palette.models';

@Component({
  selector: 'app-color-palette-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="palette-selector">
      <label class="palette-label">Theme:</label>
      <select 
        [value]="selectedPalette" 
        (change)="onPaletteChange($event)"
        class="palette-select"
        [style.background-color]="darkMode ? '#404040' : 'white'"
        [style.color]="darkMode ? '#e0e0e0' : '#111827'"
        [style.border-color]="darkMode ? '#555' : '#d1d5db'">
        <option *ngFor="let palette of availablePalettes" [value]="palette.id">
          {{ palette.name }}
        </option>
      </select>
      
      <!-- Color preview -->
      <div class="color-preview" *ngIf="currentPalette">
        <div class="preview-item">
          <span class="preview-label">Primary:</span>
          <div class="color-swatch" [style.background-color]="currentPalette.colors.primary"></div>
        </div>
        <div class="preview-item">
          <span class="preview-label">Secondary:</span>
          <div class="color-swatch" [style.background-color]="currentPalette.colors.secondary"></div>
        </div>
        <div class="preview-item">
          <span class="preview-label">Accent:</span>
          <div class="color-swatch" [style.background-color]="currentPalette.colors.accent"></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .palette-selector {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      border-radius: 0.375rem;
      background-color: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .palette-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: inherit;
      white-space: nowrap;
    }

    .palette-select {
      padding: 0.25rem 0.5rem;
      border: 1px solid;
      border-radius: 0.25rem;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .palette-select:focus {
      outline: none;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
    }

    .color-preview {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-left: 0.5rem;
    }

    .preview-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .preview-label {
      font-size: 0.75rem;
      color: inherit;
      opacity: 0.7;
    }

    .color-swatch {
      width: 1rem;
      height: 1rem;
      border-radius: 0.125rem;
      border: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    /* Dark mode styles */
    .dark .palette-selector {
      background-color: rgba(0, 0, 0, 0.2);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .dark .color-swatch {
      border-color: rgba(255, 255, 255, 0.2);
    }

    @media (max-width: 768px) {
      .color-preview {
        display: none;
      }
    }
  `]
})
export class ColorPaletteSelectorComponent {
  @Input() selectedPalette: ColorPaletteId = 'default';
  @Input() darkMode = false;
  @Output() paletteChange = new EventEmitter<ColorPaletteId>();

  get availablePalettes(): ColorPalette[] {
    const palettes = this.darkMode ? DARK_COLOR_PALETTES : COLOR_PALETTES;
    return Object.values(palettes);
  }

  get currentPalette(): ColorPalette | null {
    const palettes = this.darkMode ? DARK_COLOR_PALETTES : COLOR_PALETTES;
    return palettes[this.selectedPalette] || null;
  }

  onPaletteChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const paletteId = select.value as ColorPaletteId;
    this.paletteChange.emit(paletteId);
  }
}
