import fs from "node:fs";
import path from "node:path";

const f = path.join(process.env.TEMP || "/tmp", "pump-main.json");
const idl = JSON.parse(fs.readFileSync(f, "utf8"));

for (const ix of idl.instructions) {
  const docs = (ix.docs || []).join("\n");
  if (/remaining|bonding_curve_v2|buyback/i.test(docs)) {
    console.log("====", ix.name, "====");
    console.log(docs);
    console.log("---");
  }
}

for (const t of idl.types || []) {
  if (/v2|Bonding/i.test(t.name)) {
    console.log("TYPE", t.name, JSON.stringify(t).slice(0, 800));
  }
}

function walk(obj: unknown, pth = ""): void {
  if (!obj || typeof obj !== "object") return;
  const o = obj as Record<string, unknown>;
  if (o.kind === "const" && Array.isArray(o.value)) {
    const str = Buffer.from(o.value as number[]).toString();
    if (/v2|curve|bond|buyback/i.test(str)) {
      console.log("SEED", pth, JSON.stringify(str));
    }
  }
  for (const [k, v] of Object.entries(o)) walk(v, `${pth}.${k}`);
}
walk(idl);

// Also search raw string contexts
const s = JSON.stringify(idl);
let i = 0;
let c = 0;
while ((i = s.indexOf("bonding_curve_v2", i)) >= 0 && c < 20) {
  console.log("CTX", s.slice(Math.max(0, i - 120), i + 160));
  i += 1;
  c += 1;
}
