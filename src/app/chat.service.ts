import { Injectable, signal } from '@angular/core';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  files?: { name: string; type: string; data: string }[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  messages = signal<Message[]>([]);
  isGenerating = signal<boolean>(false);

  async sendMessage(content: string) {
    if (!content.trim() || this.isGenerating()) return;

    const newMessage: Message = { role: 'user', content };
    this.messages.update(prev => [...prev, newMessage]);
    this.isGenerating.set(true);

    const assistantMessage: Message = { role: 'assistant', content: '' };
    this.messages.update(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: this.messages().slice(0, -1).map(m => ({ role: m.role, content: m.content }))
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || 'Falha ao obter resposta. Verifique sua conexão.';
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          if (trimmed === 'data: [DONE]') break;

          try {
            const data = JSON.parse(trimmed.slice(6));
            const delta = data.choices[0]?.delta?.content || '';
            if (delta) {
              assistantContent += delta;
              
              // Only update signal if message actually changed
              this.messages.update(prev => {
                const lastIdx = prev.length - 1;
                if (lastIdx < 0) return prev;
                if (prev[lastIdx].content === assistantContent) return prev;
                
                const updated = [...prev];
                updated[lastIdx] = { ...updated[lastIdx], role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch {
            // Ignore incomplete chunks
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.messages.update(prev => {
        const updated = [...prev];
        const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido. Por favor, tente novamente.';
        updated[updated.length - 1] = { ...assistantMessage, content: `⚠️ **Erro de Sistema**\n\n${errorMsg}` };
        return updated;
      });
    } finally {
      this.isGenerating.set(false);
    }
  }

  clearHistory() {
    this.messages.set([]);
  }

  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  }
}
