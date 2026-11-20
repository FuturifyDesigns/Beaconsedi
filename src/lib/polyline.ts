/** Decode routes locally so the base map doesn't wait for Google's geometry library. */
export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points: { lat: number; lng: number }[] = [];
  const read = () => {
    let shift = 0;
    let value = 0;
    while (index < encoded.length && shift <= 30) {
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      value |= (byte & 31) << shift;
      if (byte < 32) return value & 1 ? ~(value >>> 1) : value >>> 1;
      shift += 5;
    }
    return null;
  };
  while (index < encoded.length) {
    const latitude = read();
    const longitude = read();
    if (latitude === null || longitude === null) return [];
    lat += latitude;
    lng += longitude;
    if (Math.abs(lat / 1e5) > 90 || Math.abs(lng / 1e5) > 180) return [];
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
