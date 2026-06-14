import { ChangeDetectionStrategy, Component, inject, signal, ViewChild, ElementRef, afterNextRender, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ChatService } from './chat.service';
import { MarkdownRenderer } from './markdown-renderer';
import { CodeViewerService } from './code-viewer';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MarkdownRenderer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private fb = inject(FormBuilder);
  chatService = inject(ChatService);
  codeViewer = inject(CodeViewerService);
  
  chatForm = this.fb.group({
    message: ['', [Validators.required, Validators.minLength(1)]]
  });

  attachedFiles = signal<{ name: string; type: string; data: string }[]>([]);
  showHistory = signal(false);

  @ViewChild('scrollWindow') scrollWindow!: ElementRef;
  
  private messageEffect = effect(() => {
    this.messages(); // track
    setTimeout(() => this.scrollToBottom(), 100);
  });

  messages = this.chatService.messages;

  constructor() {
    afterNextRender(() => {
      this.scrollToBottom();
    });
  }

  async onSend() {
    if (this.chatForm.invalid || this.chatService.isGenerating()) return;

    const content = this.chatForm.get('message')?.value || '';
    this.chatForm.reset();
    
    await this.chatService.sendMessage(content);
  }

  private scrollToBottom() {
    if (this.scrollWindow) {
      const el = this.scrollWindow.nativeElement;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  formatDate(date: Date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
