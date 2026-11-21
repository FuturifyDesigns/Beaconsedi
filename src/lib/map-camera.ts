/** Automatic framing is an initial convenience, never a response to selection. */
export function createMapCameraPolicy() {
  let centered = false, framed = false, userControlled = false;
  return {
    interact() { userControlled = true; },
    reset() { centered = false; framed = false; userControlled = false; },
    initialView(fitToMarkers: boolean, markerCount: number, vehicleCount: number): "fit" | "center" | "none" {
      if (userControlled) return "none";
      if (fitToMarkers && markerCount + vehicleCount > 1 && !framed) {
        framed = true; centered = true; return "fit";
      }
      if (markerCount === 1 && !centered) { centered = true; return "center"; }
      return "none";
    },
  };
}
