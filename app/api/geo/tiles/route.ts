import { connection } from "next/server";

/**
 * GET → the map tile source for the address map: OpenStreetMap by default, MapTiler when its (public) key is saved
 * in Admin → Settings → Maps. Only these two fixed hosts can ever be returned.
 */
export async function GET() {
  await connection();
  const key = process.env.MAPTILER_KEY?.trim() ?? "";
  const tiles = /^[A-Za-z0-9]{16,40}$/.test(key)
    ? { url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`, attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>', maxZoom: 20 }
    : { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors', maxZoom: 19 };
  return Response.json(tiles, { headers: { "Cache-Control": "private, max-age=300" } });
}
