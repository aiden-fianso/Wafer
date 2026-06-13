const svgNS = 'http://www.w3.org/2000/svg';

export class AnimatedBeam {
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'beam-' + Math.random().toString(36).slice(2, 9);
    this.create();
    this.update();
    this.animate();
    this._ro = new ResizeObserver(() => this.update());
    this._ro.observe(this.container);
    this._onResize = () => this.update();
    window.addEventListener('resize', this._onResize);
  }

  create() {
    this.svg = document.createElementNS(svgNS, 'svg');
    this.svg.setAttribute('fill', 'none');
    Object.assign(this.svg.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1'
    });

    const defs = document.createElementNS(svgNS, 'defs');
    this.grad = document.createElementNS(svgNS, 'linearGradient');
    this.grad.setAttribute('id', this.id);
    this.grad.setAttribute('gradientUnits', 'userSpaceOnUse');

    const start = this.gradientStart || '#6366f1';
    const stop = this.gradientStop || '#ffffff';
    const stops = [
      { o: '0%', c: start, op: '0' },
      { o: '32.5%', c: start, op: '1' },
      { o: '50%', c: stop, op: '1' },
      { o: '67.5%', c: stop, op: '1' },
      { o: '100%', c: stop, op: '0' },
    ];
    stops.forEach(s => {
      const el = document.createElementNS(svgNS, 'stop');
      el.setAttribute('offset', s.o);
      el.setAttribute('stop-color', s.c);
      el.setAttribute('stop-opacity', s.op);
      this.grad.appendChild(el);
    });
    defs.appendChild(this.grad);
    this.svg.appendChild(defs);

    this.basePath = document.createElementNS(svgNS, 'path');
    this.basePath.setAttribute('stroke', 'rgba(255,255,255,0.15)');
    this.basePath.setAttribute('stroke-width', '1.5');
    this.basePath.setAttribute('stroke-dasharray', '4 4');
    this.basePath.setAttribute('fill', 'none');
    this.svg.appendChild(this.basePath);

    this.path = document.createElementNS(svgNS, 'path');
    this.path.setAttribute('stroke', `url(#${this.id})`);
    this.path.setAttribute('stroke-width', '2');
    this.path.setAttribute('stroke-dasharray', '4 4');
    this.path.setAttribute('stroke-linecap', 'round');
    this.path.setAttribute('fill', 'none');
    this.svg.appendChild(this.path);

    this.container.appendChild(this.svg);
  }

  update() {
    const cRect = this.container.getBoundingClientRect();
    const fRect = this.from.getBoundingClientRect();
    const tRect = this.to.getBoundingClientRect();

    this.svgWidth = cRect.width;
    this.svgHeight = cRect.height;
    this.svg.setAttribute('viewBox', `0 0 ${this.svgWidth} ${this.svgHeight}`);

    const sx = fRect.left - cRect.left + fRect.width / 2;
    const sy = fRect.top - cRect.top + fRect.height / 2 + (this.startYOffset || 0);
    const ex = tRect.left - cRect.left + tRect.width / 2;
    const ey = tRect.top - cRect.top + tRect.height / 2 + (this.endYOffset || 0);

    const cpx = (sx + ex) / 2;
    const cpy = (sy + ey) / 2 - (this.curvature || 0);
    const d = `M ${sx},${sy} Q ${cpx},${cpy} ${ex},${ey}`;
    this.basePath.setAttribute('d', d);
    this.path.setAttribute('d', d);
  }

  animate() {
    const dur = (this.duration || 5) * 1000;
    const delay = (this.delay || 0) * 1000;
    const startTime = performance.now() + delay;
    this._animating = true;

    const tick = (now) => {
      if (!this._animating) return;
      let t = ((now - startTime) % dur) / dur;
      if (t < 0) t = 0;
      if (this.reverse) t = 1 - t;

      const offset = -this.svgWidth + 2 * this.svgWidth * t;
      this.grad.setAttribute('x1', offset);
      this.grad.setAttribute('x2', offset + this.svgWidth);
      this.grad.setAttribute('y1', '0');
      this.grad.setAttribute('y2', '0');

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  destroy() {
    this._animating = false;
    this._ro.disconnect();
    window.removeEventListener('resize', this._onResize);
    if (this.svg && this.svg.parentNode) {
      this.svg.parentNode.removeChild(this.svg);
    }
  }
}
