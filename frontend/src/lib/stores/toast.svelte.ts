type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

class ToastStore {
  messages = $state<Toast[]>([]);
  private nextId = 1;

  private push(message: string, variant: ToastVariant, timeoutMs = 4000) {
    const id = this.nextId++;
    this.messages = [...this.messages, { id, message, variant }];
    if (timeoutMs > 0) {
      setTimeout(() => this.dismiss(id), timeoutMs);
    }
  }

  success(message: string) {
    this.push(message, 'success');
  }
  error(message: string) {
    this.push(message, 'error', 6000);
  }
  info(message: string) {
    this.push(message, 'info');
  }

  dismiss(id: number) {
    this.messages = this.messages.filter((m) => m.id !== id);
  }
}

export const toast = new ToastStore();
