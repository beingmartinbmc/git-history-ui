import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MarkdownPipe } from './markdown.pipe';

@Component({
  standalone: true,
  imports: [MarkdownPipe],
  template: `<div [innerHTML]="text | markdown"></div>`,
})
class HostComponent {
  text = '';
}

describe('MarkdownPipe', () => {
  const pipe = new MarkdownPipe();

  function render(text: string): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.text = text;
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('div');
  }

  it('returns a plain string, never a trusted SafeHtml wrapper', () => {
    expect(typeof pipe.transform('**hi**')).toBe('string');
    expect(pipe.transform('**hi**')).toContain('<strong>hi</strong>');
    expect(pipe.transform(null)).toBe('');
  });

  it('escapes raw tags and script payloads', () => {
    const el = render('<script>window.__pwned = 1</script> <b>raw</b>');
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toContain('<script>');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('does not create javascript: links', () => {
    const el = render('[x](javascript:alert(1)) <a href="javascript:alert(1)">y</a>');
    expect(el.querySelector('a')).toBeNull();
  });

  it('does not create event-handler elements', () => {
    const el = render('<img src=x onerror="alert(1)">');
    expect(el.querySelector('img')).toBeNull();
  });
});
