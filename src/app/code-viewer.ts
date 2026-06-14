import { Injectable, signal, computed, WritableSignal } from '@angular/core';

export interface CodeFile {
  id: string;
  name: string;
  language: string;
}

@Injectable({
  providedIn: 'root'
})
export class CodeViewerService {
  activeFile = signal<CodeFile | null>(null);
  
  private contentRegistry = new Map<string, WritableSignal<string>>();
  private contentToId = new Map<string, string>();
  private registryIds: string[] = [];
  private readonly MAX_REGISTRY_SIZE = 500;

  activeContent = computed(() => {
    const file = this.activeFile();
    if (!file) return '';
    return this.contentRegistry.get(file.id)?.() || '';
  });

  registerContent(content: string, stableId?: string): string {
    if (!content && content !== '') return '';
    
    // If we have a stable ID, we update the content for that ID
    if (stableId) {
      const existingSignal = this.contentRegistry.get(stableId);
      if (existingSignal) {
        existingSignal.set(content);
      } else {
        this.contentRegistry.set(stableId, signal(content));
      }
      
      this.contentToId.set(content, stableId);
      if (!this.registryIds.includes(stableId)) {
        this.registryIds.push(stableId);
      }
      return stableId;
    }

    // Check if we already have this exact content
    const existingId = this.contentToId.get(content);
    if (existingId) {
      return existingId;
    }

    const id = `code-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Keep registry size limited
    if (this.registryIds.length >= this.MAX_REGISTRY_SIZE) {
      const oldestId = this.registryIds.shift()!;
      const oldestContent = Array.from(this.contentToId.entries()).find(([, v]) => v === oldestId)?.[0];
      if (oldestContent) {
        this.contentToId.delete(oldestContent);
      }
      this.contentRegistry.delete(oldestId);
    }

    this.contentToId.set(content, id);
    this.contentRegistry.set(id, signal(content));
    this.registryIds.push(id);
    return id;
  }

  getContent(id: string): string | undefined {
    return this.contentRegistry.get(id)?.();
  }

  open(file: CodeFile) {
    this.activeFile.set(file);
  }

  close() {
    this.activeFile.set(null);
  }

  clearRegistry() {
    this.contentRegistry.clear();
    this.contentToId.clear();
    this.registryIds = [];
  }
}
