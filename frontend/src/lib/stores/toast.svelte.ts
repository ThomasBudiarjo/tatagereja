class ToastStore {
  message = $state<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(msg: string, durationMs = 2000) {
    this.message = msg;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.message = null;
      this.timer = null;
    }, durationMs);
  }
}

export const toast = new ToastStore();
