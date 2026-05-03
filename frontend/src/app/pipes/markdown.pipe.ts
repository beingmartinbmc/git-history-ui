import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  private cache = new Map<string, SafeHtml>();

  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    const hit = this.cache.get(value);
    if (hit) return hit;
    const rendered = this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(value));
    this.cache.set(value, rendered);
    if (this.cache.size > 50) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
    return rendered;
  }
}

function renderMarkdown(src: string): string {
  let html = escapeHtml(src);

  // Code blocks (``` ... ```)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, _lang, code) => `<pre><code>${code.trim()}</code></pre>`,
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers (### before ## before #)
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists (- or *)
  html = html.replace(/^(\s*)[-*] (.+)$/gm, (_m, indent, text) => {
    const depth = Math.floor(indent.length / 2);
    return `<li data-depth="${depth}">${text}</li>`;
  });
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Numbered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?){2,})/g, (block) =>
    block.includes('data-depth') ? block : `<ol>${block}</ol>`,
  );

  // Paragraphs: convert double newlines
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs around block elements
  html = html.replace(/<p>\s*(<(?:h[2-4]|ul|ol|pre|blockquote)[^>]*>)/g, '$1');
  html = html.replace(/(<\/(?:h[2-4]|ul|ol|pre|blockquote)>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*<\/p>/g, '');

  // Single newlines → <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
