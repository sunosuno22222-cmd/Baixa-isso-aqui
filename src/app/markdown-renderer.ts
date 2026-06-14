import { Component, ViewEncapsulation, inject, ElementRef, afterNextRender, input, effect } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Marked, Renderer } from 'marked';
import hljs from 'highlight.js';
import markedKatex from 'marked-katex-extension';
import { CodeViewerService } from './code-viewer';

@Component({
  selector: 'app-markdown-renderer',
  standalone: true,
  template: `<div [innerHTML]="safeHtml" class="markdown-content"></div>`,
  encapsulation: ViewEncapsulation.None,
  styles: [`
    :host {
      display: block;
      width: 100%;
      max-width: 100%;
      overflow: hidden;
      min-width: 0;
    }
    .markdown-content {
      line-height: 1.7;
      font-size: 0.95rem;
      color: #374151;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      display: block;
      overflow-x: hidden;
    }
    
    /* Document/File Button Styles */
    .file-attachment-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      margin: 1rem 0;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      user-select: none;
    }
    .file-attachment-card:hover {
      background: #f3f4f6;
      border-color: #d1d5db;
      transform: translateY(-1px);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .file-icon-box {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      color: #6b7280;
    }
    .file-info {
      flex: 1;
      min-width: 0;
    }
    .file-name {
      font-size: 0.9rem;
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-type {
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
    }
    
    .generating-placeholder {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: #6b7280;
      font-size: 0.9rem;
      padding: 12px 16px;
      background: #f9fafb;
      border: 1px dashed #d1d5db;
      border-radius: 12px;
      margin: 1rem 0;
      width: 100%;
      box-sizing: border-box;
    }
    .dot-pulse {
      display: flex;
      gap: 3px;
    }
    .dot {
      width: 4px;
      height: 4px;
      background: currentColor;
      border-radius: 50%;
      animation: pulse 1s infinite ease-in-out;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.2); }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .animate-spin {
      animation: spin 2s linear infinite;
    }

    .markdown-content blockquote {
      border-left: 4px solid #000;
      padding: 1rem 1.5rem;
      margin: 1.5rem 0;
      background-color: #f9fafb;
      border-radius: 0 8px 8px 0;
      color: #4b5563;
      font-style: italic;
    }
    
    .katex-display {
      margin: 1.5rem 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 1rem 0;
      max-width: 100%;
    }
    .katex {
      font-size: 1.1em;
    }
    
    .markdown-content code:not(pre code) {
      background-color: #f3f4f6;
      color: #000;
      padding: 0.2rem 0.4rem;
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 0.85em;
    }

    .markdown-content h1, .markdown-content h2, .markdown-content h3 {
      font-weight: 700;
      margin-top: 2rem;
      margin-bottom: 1rem;
      color: #000;
      letter-spacing: -0.01em;
      line-height: 1.25;
    }
    .markdown-content h1 { font-size: 1.4rem; }
    .markdown-content h2 { font-size: 1.2rem; }
    .markdown-content h3 { font-size: 1.1rem; }
    .markdown-content p { margin-bottom: 1rem; }
    .markdown-content a {
      color: #2563eb;
      text-decoration: underline;
      font-weight: 500;
      transition: opacity 0.2s;
    }
    .markdown-content a:hover {
      opacity: 0.8;
    }
    .code-block-wrapper {
      margin: 1.5rem 0;
      background: #000;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid rgba(0, 0, 0, 0.05);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .code-block-wrapper pre {
      margin: 0;
      padding: 1.5rem;
      overflow-x: auto;
    }
    .code-block-wrapper code {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      line-height: 1.6;
      background: transparent !important;
      padding: 0 !important;
    }
  `]
})
export class MarkdownRenderer {
  private sanitizer = inject(DomSanitizer);
  private elementRef = inject(ElementRef);
  private codeViewer = inject(CodeViewerService);
  private renderer = new Renderer();
  private listenerTimer: ReturnType<typeof setTimeout> | undefined;
  private blockCounter = 0;
  private instanceId = Math.random().toString(36).substring(2, 9);
  private static markedConfigured = false;
  private static markedInstance: Marked;

  content = input<string>('');
  showFullCode = input<boolean>(false);

  safeHtml: SafeHtml = '';

  constructor() {
    if (!MarkdownRenderer.markedConfigured) {
      MarkdownRenderer.markedInstance = new Marked(
        markedKatex({
          throwOnError: false,
          displayMode: false,
        })
      );
      MarkdownRenderer.markedConfigured = true;
    }

    this.renderer.table = () => ''; // Strictly disable tables

    this.renderer.link = ({ href, title, text }: { href: string; title?: string | null; text: string }): string => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    this.renderer.code = ({ text, lang }: { text: string; lang?: string }): string => {
      lang = (lang || 'plaintext').trim();
      const cleanLang = lang.split('[')[0];
      
      const blockId = `block-${this.instanceId}-${this.blockCounter++}`;
      
      if (this.showFullCode()) {
        const highlighted = hljs.highlight(text, { 
          language: hljs.getLanguage(cleanLang) ? cleanLang : 'plaintext' 
        }).value;
        
        return `
          <div class="code-block-wrapper">
            <pre><code class="hljs language-${cleanLang}">${highlighted}</code></pre>
          </div>
        `;
      }

      // Check for filename in [name] format
      let filename = 'arquivo.txt';
      let language = cleanLang;
      
      const fileMatch = lang.match(/^([a-z0-9]+)\[(.*?)\]$/i);
      if (fileMatch) {
        language = fileMatch[1];
        filename = fileMatch[2];
      } else if (cleanLang && cleanLang !== 'text' && cleanLang !== 'plaintext') {
        filename = `codigo.${cleanLang}`;
      }

      const contentId = this.codeViewer.registerContent(text, blockId);

      return `
        <div class="file-attachment-card" 
             data-file-name="${filename}" 
             data-content-id="${contentId}" 
             data-file-lang="${language}">
          <div class="file-icon-box">
            <span class="material-icons">description</span>
          </div>
          <div class="file-info">
            <div class="file-name">${filename}</div>
            <div class="file-type">${language}</div>
          </div>
          <div class="open-icon">
            <span class="material-icons" style="font-size: 20px; color: #000">open_in_new</span>
          </div>
        </div>
      `;
    };

    this._lastProcessedContent = '';
    
    // Auto-parse on input changes
    effect(() => {
      this.parseMarkdown(this.content() || '');
    });

    afterNextRender(() => {
      this.attachFileListeners();
    });
  }

  private _lastProcessedContent = '';

  private parseMarkdown(content: string) {
    if (!content) {
      this.safeHtml = '';
      return;
    }

    if (this._lastProcessedContent === content) return;
    this._lastProcessedContent = content;
    this.blockCounter = 0;
    
    let processedContent = content
      .replace(/\\\[/g, '$$$$')
      .replace(/\\\]/g, '$$$$')
      .replace(/\\\(/g, '$')
      .replace(/\\\)/g, '$');

    // Handle "Generating..." state: Hide the unclosed code block at the VERY end
    // Use backtick count to reliably detect if we're inside an open block
    const tickCount = (processedContent.match(/```/g) || []).length;
    const isUnclosed = tickCount % 2 !== 0;
    
    if (isUnclosed && !this.showFullCode()) {
      const lastBlockIndex = processedContent.lastIndexOf('```');
      if (lastBlockIndex !== -1) {
        // Find what type of file it is if possible
        const blockHeader = processedContent.substring(lastBlockIndex).match(/```([a-z0-9]*)(?:\[(.*?)\])?/);
        const filename = blockHeader?.[2] || 'arquivo';
        
        processedContent = processedContent.substring(0, lastBlockIndex);
        processedContent += `\n\n<div class="generating-placeholder">
          <span class="material-icons animate-spin" style="font-size: 16px">sync</span>
          <span>Gerando ${filename}...</span>
          <div class="dot-pulse"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
        </div>`;
      }
    }

    try {
      const html = MarkdownRenderer.markedInstance.parse(processedContent, { 
        renderer: this.renderer,
        async: false
      }) as string;
      this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(html);
      this.attachFileListeners();
    } catch (e) {
      console.error('Markdown parsing error:', e);
      this.safeHtml = content;
    }
  }

  private attachFileListeners() {
    if (typeof window === 'undefined') return;
    
    clearTimeout(this.listenerTimer);
    this.listenerTimer = setTimeout(() => {
      const cards = this.elementRef.nativeElement.querySelectorAll('.file-attachment-card');
      cards.forEach((card: HTMLElement) => {
        if (card.hasAttribute('data-has-click')) return;
        card.addEventListener('click', () => {
          const name = card.getAttribute('data-file-name') || '';
          const id = card.getAttribute('data-content-id') || '';
          const language = card.getAttribute('data-file-lang') || '';
          this.codeViewer.open({ id, name, language });
        });
        card.setAttribute('data-has-click', 'true');
      });
    }, 50);
  }
}


