import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QrCode, Plus, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createVehicle } from "@/lib/admin.functions";

const PUBLISHED = "https://my-safe-pin.lovable.app";

export function JoinQrCard() {
  const [url, setUrl] = useState(`${PUBLISHED}/auth?mode=signup`);
  useEffect(() => {
    // Use the published address unless running on a custom domain.
    const o = window.location.origin;
    if (!o.includes("lovable") && !o.includes("localhost")) setUrl(`${o}/auth?mode=signup`);
  }, []);

  function download() {
    const svg = document.getElementById("beacon-join-qr");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "beacon-join-qr.svg";
    a.click();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-medium"><QrCode className="h-4 w-4" /> Join BEACON SEDI QR code</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone who scans this joins BEACON SEDI as a patient. Change their role below if needed.
      </p>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-lg bg-background p-3 ring-1 ring-border">
          <QRCodeSVG id="beacon-join-qr" value={url} size={176} level="M" includeMargin />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="break-all font-mono text-xs">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copied"); }}>
              <Copy className="h-3.5 w-3.5" /> Copy link
            </Button>
            <Button size="sm" variant="outline" onClick={download}>
              <Download className="h-3.5 w-3.5" /> Download QR
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

const KINDS = [
  ["ambulance", "Ambulance"],
  ["police", "Police"],
  ["fire", "Fire"],
  ["rescue", "Rescue"],
  ["air", "Air ambulance"],
] as const;

export function AddVehicleCard() {
  const qc = useQueryClient();
  const createFn = useServerFn(createVehicle);
  const empty = { name: "", callSign: "", kind: "ambulance" as (typeof KINDS)[number][0], vehicle: "", registrationNumber: "", phone: "" };
  const [form, setForm] = useState(empty);
  const m = useMutation({
    mutationFn: () => createFn({ data: form }),
    onSuccess: () => {
      toast.success(`Vehicle ${form.callSign.toUpperCase()} added`);
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["admin-vehicle-assignments"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const input = "min-h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-medium"><Plus className="h-4 w-4" /> Add vehicle</h2>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
      >
        <input required placeholder="Name (e.g. Gaborone Ambulance 4)" value={form.name} onChange={set("name")} className={input} />
        <input required placeholder="Call sign (e.g. AMB-04)" value={form.callSign} onChange={set("callSign")} className={input} />
        <select value={form.kind} onChange={set("kind")} className={input} aria-label="Vehicle type">
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input placeholder="Model (e.g. Toyota Land Cruiser)" value={form.vehicle} onChange={set("vehicle")} className={input} />
        <input placeholder="Registration number" value={form.registrationNumber} onChange={set("registrationNumber")} className={input} />
        <input placeholder="Vehicle phone" value={form.phone} onChange={set("phone")} className={input} />
        <Button type="submit" disabled={m.isPending} className="bg-emergency text-emergency-foreground hover:bg-emergency/90 sm:col-span-2">
          {m.isPending ? "Adding…" : "Add vehicle"}
        </Button>
      </form>
    </section>
  );
}
