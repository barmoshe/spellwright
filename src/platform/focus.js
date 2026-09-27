// platform/focus.js — focus-loss boundary (architecture §8). The ONLY module that listens to
// window blur / document visibilitychange. On loss: clear held input, ask the game to auto-pause,
// suspend audio (optional per settings). On regain: resume audio. Gameplay code never sees DOM focus.

export class FocusBoundary {
  /**
   * @param {{ onLost: () => void, onRegained: () => void }} hooks
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.hasFocus = true;
    this._onBlur = () => this._lost();
    this._onFocus = () => this._regained();
    this._onVis = () => (document.visibilityState === 'hidden' ? this._lost() : this._regained());
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('focus', this._onFocus);
    document.addEventListener('visibilitychange', this._onVis);
  }

  _lost() {
    if (!this.hasFocus) return;
    this.hasFocus = false;
    this.hooks.onLost();
  }

  _regained() {
    if (this.hasFocus) return;
    this.hasFocus = true;
    this.hooks.onRegained();
  }

  destroy() {
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('focus', this._onFocus);
    document.removeEventListener('visibilitychange', this._onVis);
  }
}
