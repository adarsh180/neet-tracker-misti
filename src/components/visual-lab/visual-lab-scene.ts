"use client";

export type ScenePoint = { x: number; y: number };

export type SceneRay = {
  from: ScenePoint;
  to: ScenePoint;
  color: string;
  dashed?: boolean;
  width?: number;
  label?: string;
};

export class VisualScene {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  panel(x: number, y: number, w: number, h: number, radius = 14, fill = "rgba(4,4,14,0.62)", stroke = "rgba(255,255,255,0.12)") {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  text(x: number, y: number, text: string, color = "rgba(255,255,255,0.88)", font = "700 12px Inter,sans-serif", align: CanvasTextAlign = "start") {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  ray(ray: SceneRay) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = ray.color;
    ctx.lineWidth = ray.width ?? 1.8;
    ctx.lineCap = "round";
    ctx.shadowColor = ray.color;
    ctx.shadowBlur = 10;
    if (ray.dashed) ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(ray.from.x, ray.from.y);
    ctx.lineTo(ray.to.x, ray.to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    if (ray.label) {
      const mx = (ray.from.x + ray.to.x) / 2;
      const my = (ray.from.y + ray.to.y) / 2;
      this.text(mx + 8, my - 8, ray.label, ray.color, "800 10px Inter,sans-serif");
    }
    ctx.restore();
  }

  arrow(from: ScenePoint, to: ScenePoint, color: string, label?: string) {
    const ctx = this.ctx;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    this.ray({ from, to, color, width: 2, label });
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - 9 * Math.cos(angle - Math.PI / 6), to.y - 9 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - 9 * Math.cos(angle + Math.PI / 6), to.y - 9 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  point(point: ScenePoint, color: string, label?: string, radius = 5) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (label) this.text(point.x + 8, point.y - 8, label, color, "800 11px Inter,sans-serif");
    ctx.restore();
  }

  ruler(from: ScenePoint, to: ScenePoint, label: string, color = "rgba(255,255,255,0.54)") {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    this.text((from.x + to.x) / 2 - 12, (from.y + to.y) / 2 - 6, label, color, "800 10px Inter,sans-serif");
    ctx.restore();
  }

  callout(x: number, y: number, title: string, body: string, accent = "#41f4ff") {
    const ctx = this.ctx;
    const w = Math.min(260, Math.max(180, ctx.canvas.width - x - 24));
    this.panel(x, y, w, 66, 14, "rgba(4,4,14,0.68)", "rgba(255,255,255,0.13)");
    this.text(x + 12, y + 22, title, accent, "800 11px Inter,sans-serif");
    this.text(x + 12, y + 45, body.length > 42 ? `${body.slice(0, 39)}...` : body, "rgba(246,240,230,0.62)", "11px Inter,sans-serif");
  }
}
