import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const [workerUrl, previewUrl = workerUrl] = process.argv.slice(2);
if (!workerUrl) {
  throw new Error("Usage: node scripts/export-pages-home.mjs <https-worker-url> [preview-url]");
}

const worker = new URL(workerUrl);
const preview = new URL(previewUrl);
if (worker.protocol !== "https:" || worker.pathname !== "/" || worker.search || worker.hash) {
  throw new Error("Use the HTTPS origin of the full Beacon Sedi app.");
}

const response = await fetch(new URL("/", preview));
if (!response.ok) throw new Error("Could not render the Beacon Sedi homepage.");

const assets = new Set();
const page = (await response.text())
  // The public homepage links to the Worker for all interactive app routes.
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<link\b[^>]*\brel="(?:modulepreload|manifest)"[^>]*>/gi, "")
  .replace(/\b(href|src)="(\/(?!\/)[^"]*)"/g, (attribute, name, url) => {
    if (url === "/") return name + '="./"';
    if (/^\/assets\/[a-z0-9_.-]+[.](?:css|jpg|jpeg|png|webp|woff2?)$/i.test(url) ||
        url === "/favicon.ico" || url === "/apple-touch-icon.png") {
      assets.add(url);
      return name + '=".' + url + '"';
    }
    if (name === "href" && !url.startsWith("/assets/")) {
      return name + '="' + new URL(url, worker).href + '"';
    }
    return attribute;
  });

if (!page.includes(worker.origin + "/sos") || !page.includes(worker.origin + "/auth")) {
  throw new Error("The public entry page is missing its SOS or sign-in link.");
}

const output = "output/pages";
await mkdir(output, { recursive: true });
await Promise.all([...assets].map(async (path) => {
  const asset = await fetch(new URL(path, preview));
  if (!asset.ok) throw new Error("Could not download " + path);
  const destination = join(output, path.slice(1));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await asset.arrayBuffer()));
}));
await writeFile(join(output, ".nojekyll"), "");
await writeFile(join(output, "index.html"), page);
