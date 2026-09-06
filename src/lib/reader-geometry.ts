export type PassageBox = { x: number; y: number; width: number; height: number };

export function validPassageBox(value: unknown): value is PassageBox {
  if (!value || typeof value !== "object") return false;
  const box = value as PassageBox;
  return [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
    && box.x + box.width <= 1.002 && box.y + box.height <= 1.002;
}

export function passageStyle(box: PassageBox) {
  return { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` };
}
