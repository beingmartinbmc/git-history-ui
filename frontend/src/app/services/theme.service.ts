import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'ghui:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private doc = inject(DOCUMENT);
  private mediaQuery: MediaQueryList | null = null;

  readonly preference = signal<ThemePreference>(this.read());
  private systemDark = signal<boolean>(false);

  readonly resolved = computed<ResolvedTheme>(() => {
    const pref = this.preference();
    if (pref === 'system') return this.systemDark() ? 'dark' : 'light';
    return pref;
  });

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemDark.set(this.mediaQuery.matches);
      this.mediaQuery.addEventListener('change', (e) => this.systemDark.set(e.matches));
    }
    effect(() => {
      const theme = this.resolved();
      const root = this.doc.documentElement;
      root.classList.toggle('dark', theme === 'dark');
      root.dataset['theme'] = theme;
      this.doc.body?.classList?.toggle('dark', theme === 'dark');
    });
  }

  setPreference(p: ThemePreference) {
    this.preference.set(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
  }

  cycle() {
    const order: ThemePreference[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(this.preference()) + 1) % order.length];
    this.setPreference(next);
  }

  private read(): ThemePreference {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch {
      /* ignore */
    }
    return 'system';
  }
}
