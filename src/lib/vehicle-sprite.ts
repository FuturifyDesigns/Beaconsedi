import { normalizeHeading } from "@/lib/vehicle-heading";
type Renderer = (heading: number) => string;
let prepared: Promise<Renderer | null> | undefined;
/** Rotate the original top-down ambulance locally; no extra map/API requests. */
export function prepareVehicleSprite(source: string): Promise<Renderer | null> {
  if (prepared) return prepared;
  if (typeof Image === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  prepared = new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const cache = new Map<number, string>();
      resolve(heading => {
        const angle = Math.round(normalizeHeading(heading) / 2) * 2 % 360;
        const cached = cache.get(angle); if (cached) return cached;
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
        const context = canvas.getContext("2d"); if (!context) return source;
        context.translate(64, 64);
        // The supplied artwork's bonnet points down: turn it north before applying bearing.
        context.rotate((angle + 180) * Math.PI / 180);
        context.drawImage(image, 480, 60, 575, 900, -30, -47, 60, 94);
        const url = canvas.toDataURL("image/png"); cache.set(angle, url); return url;
      });
    };
    image.onerror = () => { prepared = undefined; resolve(null); };
    image.src = source;
  });
  return prepared;
}
