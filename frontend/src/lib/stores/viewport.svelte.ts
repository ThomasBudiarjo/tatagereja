/**
 * Reactive viewport store. Read `viewport.isDesktop` from components — it
 * updates as the window resizes. SSR-safe (defaults to mobile when there
 * is no window).
 */
class ViewportStore {
  width = $state(typeof window !== 'undefined' ? window.innerWidth : 0);

  get isDesktop(): boolean {
    return this.width >= 1024;
  }

  init() {
    if (typeof window === 'undefined') return;
    this.width = window.innerWidth;
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  private onResize = () => {
    this.width = window.innerWidth;
  };
}

export const viewport = new ViewportStore();
