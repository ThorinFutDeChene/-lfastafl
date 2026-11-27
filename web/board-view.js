/* Local 3D presentation with an accessible, independent 2D alternative. */
(() => {
  'use strict';

  let rendererModule = null;
  function loadRenderer() {
    if (!rendererModule) {
      rendererModule = import('/board3d.js').catch(error => {
        rendererModule = null;
        throw error;
      });
    }
    return rendererModule;
  }

  class AlfastaflBoardView {
    constructor({prefix, flat, callbacks = {}, active = true}) {
      const element = suffix => document.getElementById(prefix + '-' + suffix);
      this.root = element('board-view');
      this.host = element('board-3d');
      this.flat = flat;
      this.selector = element('board-mode');
      this.quality = element('board-quality');
      this.status = element('board-status');
      this.cameraButtons = [element('camera-top'), element('camera-reset'),
        element('camera-zoom-in'), element('camera-zoom-out')];
      this.callbacks = callbacks;
      this.active = active;
      this.mode = '3d';
      this.renderer = null;
      this.loading = null;
      this.state = null;
      this.disposed = false;
      this.failed = false;
      this.rendererGeneration = 0;
      this.captureGeneration = 0;
      this.root.boardView = this;
      this.selector.value = '3d';
      this.selector.addEventListener('change', () => this.setMode(this.selector.value));
      this.quality.addEventListener('change', () => {
        if (this.renderer) this.renderer.setQuality(this.quality.value);
      });
      this.cameraButtons[0].addEventListener('click', () => this.renderer?.topView());
      this.cameraButtons[1].addEventListener('click', () => this.renderer?.resetCamera());
      this.cameraButtons[2].addEventListener('click', () => this.renderer?.zoomBy(0.82));
      this.cameraButtons[3].addEventListener('click', () => this.renderer?.zoomBy(1.22));
      this.inputError = event => this.message('L’action n’a pas pu être traitée : ' +
        String(event.detail?.message || 'réessayez après la mise à jour du plateau.'), 'error');
      this.host.addEventListener('board-input-error', this.inputError);
      this.visibilityChanged = () => this.syncActivity();
      document.addEventListener('visibilitychange', this.visibilityChanged);
      this.showFlat();
      if (this.active) this.ensureRenderer();
    }

    message(text, kind = 'info') {
      if (this.status.textContent !== text) this.status.textContent = text;
      this.status.dataset.kind = kind;
    }

    controls(ready) {
      for (const button of this.cameraButtons) button.disabled = !ready;
      this.quality.disabled = !ready;
      this.root.dataset.view = ready ? '3d' : '2d';
    }

    showFlat() {
      this.host.hidden = true;
      this.flat.hidden = false;
      this.controls(false);
      if (this.renderer) this.renderer.setActive(false);
      this.root.dataset.state = this.failed ? 'fallback' : 'ready';
    }

    show3D() {
      this.host.hidden = false;
      this.flat.hidden = true;
      this.controls(true);
      this.root.dataset.state = 'ready';
      this.message('Caméra libre · votre orientation reste indépendante de celle des autres joueurs.');
      this.syncActivity();
      this.renderer.resize();
    }

    syncActivity() {
      if (!this.renderer) return;
      this.renderer.setActive(this.active && this.mode === '3d' && !this.host.hidden && !document.hidden);
    }

    fail() {
      if (this.disposed) return;
      this.failed = true;
      this.mode = '2d';
      this.selector.value = '2d';
      this.rendererGeneration++;
      const renderer = this.renderer || this.host.board3d;
      this.renderer = null;
      if (renderer) {
        try { renderer.dispose(); } catch (_) { /* Keep the playable 2D board. */ }
      }
      this.host.replaceChildren();
      this.host.board3d = null;
      this.showFlat();
      this.message('La vue 3D n’a pas pu démarrer ou a été interrompue. La vue 2D reste disponible ; choisissez Vue 3D pour réessayer.', 'error');
    }

    ensureRenderer() {
      if (this.disposed || !this.active || this.mode !== '3d') return Promise.resolve();
      if (this.renderer) {
        this.show3D();
        return Promise.resolve(this.renderer);
      }
      if (this.loading) return this.loading;
      this.failed = false;
      this.host.hidden = false;
      this.flat.hidden = true;
      this.controls(false);
      this.root.dataset.state = 'loading';
      this.message('Préparation du plateau 3D…');
      this.loading = (async () => {
        try {
          const {Board3D} = await loadRenderer();
          // A dialog may have closed, or the user selected 2D, while loading.
          // Reopening uses the most recent board, never an earlier snapshot.
          if (this.disposed || !this.active || this.mode !== '3d') return;
          const generation = ++this.rendererGeneration;
          this.host.hidden = false;
          this.flat.hidden = true;
          const renderer = new Board3D(this.host, {
            ...this.callbacks,
            onError: () => {
              queueMicrotask(() => {
                if (!this.disposed && generation === this.rendererGeneration) this.fail();
              });
            },
          });
          this.renderer = renderer;
          renderer.setQuality(this.quality.value);
          if (this.state) renderer.update(this.state);
          this.show3D();
          return renderer;
        } catch (_) {
          if (!this.disposed && this.mode === '3d') this.fail();
        } finally {
          this.loading = null;
        }
      })();
      return this.loading;
    }

    update(state) {
      this.state = state;
      if (this.renderer) {
        try { this.renderer.update(state); }
        catch (_) { this.fail(); }
      }
    }

    async playMove(event, options) {
      if (!this.active || this.mode !== '3d' || this.disposed) return false;
      // Delayed GL initialization may complete after an unrelated server state.
      const requestedState = this.state;
      if (!this.renderer) await this.ensureRenderer();
      if (this.disposed || !this.active || this.mode !== '3d' || !this.renderer ||
          this.state !== requestedState) return false;
      return this.renderer.playMove(event, options);
    }

    cancelMove() {
      this.renderer?.cancelMove();
    }

    async playCapture(event, options) {
      if (!this.active || this.mode !== '3d' || this.disposed) return false;
      const generation = ++this.captureGeneration;
      const started = performance.now();
      if (!this.renderer) await this.ensureRenderer();
      if (generation !== this.captureGeneration || this.disposed || !this.active ||
          this.mode !== '3d' || !this.renderer) return false;
      const remaining = Number(options?.remaining);
      if (Number.isFinite(remaining)) {
        const liveRemaining = remaining - (performance.now() - started) / 1000;
        if (liveRemaining <= 0) return false;
        options = {...options, remaining: liveRemaining};
      }
      return this.renderer.playCapture(event, options);
    }

    cancelCapture() {
      this.captureGeneration++;
      this.renderer?.cancelCapture();
    }

    setMode(mode) {
      if (this.disposed || !['2d', '3d'].includes(mode)) return;
      this.mode = mode;
      this.selector.value = mode;
      this.failed = false;
      if (mode === '2d') {
        this.cancelCapture();
        this.showFlat();
        this.message('Vue 2D · souris, tactile et clavier. Les flèches parcourent les cases ; Entrée sélectionne.');
      } else {
        this.ensureRenderer();
      }
    }

    setActive(active) {
      if (!active && this.active) this.cancelCapture();
      this.active = Boolean(active);
      this.syncActivity();
      if (this.active && this.mode === '3d') this.ensureRenderer();
    }

    is3D() {
      return this.mode === '3d' && Boolean(this.renderer) && !this.host.hidden;
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.captureGeneration++;
      this.rendererGeneration++;
      document.removeEventListener('visibilitychange', this.visibilityChanged);
      this.host.removeEventListener('board-input-error', this.inputError);
      if (this.renderer) this.renderer.dispose();
      this.renderer = null;
      this.host.replaceChildren();
    }
  }

  window.AlfastaflBoardView = AlfastaflBoardView;
})();
