// order-data.mjs
// Re-orders a Cloudflare D1 data-only export (INSERT statements) so that every row is
// inserted AFTER the rows it points to. This lets the import run without
// "PRAGMA defer_foreign_keys".
//
// What it does:
//   1. Splits the file into statements (respecting quoted text).
//   2. Groups INSERT statements by table, keeping the original row order inside each table.
//   3. Writes the tables in parent-before-child order, using fk-graph.json.
//   4. For the two "loop" columns listed in fk-graph.json (deferredColumns), writes NULL in the
//      INSERT and adds an UPDATE at the very end that fills the real value in.
//   5. Drops PRAGMA / BEGIN / COMMIT lines.
//
// It prints table names and row counts only. It never prints row contents.
//
// Usage:  node scripts/snapshot/order-data.mjs <input-data.sql> <output-data.sql>

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("Usage: node order-data.mjs <input-data.sql> <output-data.sql>");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const graph = JSON.parse(readFileSync(join(here, "fk-graph.json"), "utf8"));
const columns = graph.columns; // table -> ordered column names
const deferred = graph.deferredColumns; // [{table, column, primaryKey}]
const deferredKey = new Set(deferred.map((d) => `${d.table}.${d.column}`));

// ---------- 1. split into statements ----------
const text = readFileSync(inPath, "utf8").replace(/^﻿/, "");
const statements = [];
{
  let start = 0;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      inQuote = !inQuote; // '' inside a string flips twice, which is correct
    } else if (ch === ";" && !inQuote) {
      const s = text.slice(start, i).trim();
      if (s) statements.push(s);
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) statements.push(tail);
}

// ---------- 2. parse INSERTs ----------
const insertHead =
  /^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))\s*(?:\(([^)]*)\))?\s*VALUES\s*\(/i;

function splitValues(s, openIdx) {
  // s[openIdx] is the "(" that starts the value list. Returns {values, end}
  const values = [];
  let depth = 0;
  let inQuote = false;
  let cur = openIdx + 1;
  for (let i = openIdx + 1; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      if (ch === "'") inQuote = false; // '' reopens on the next character
      continue;
    }
    if (ch === "'") inQuote = true;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth === 0) {
        values.push(s.slice(cur, i).trim());
        return { values, end: i };
      }
      depth--;
    } else if (ch === "," && depth === 0) {
      values.push(s.slice(cur, i).trim());
      cur = i + 1;
    }
  }
  throw new Error("Unbalanced parentheses in an INSERT statement");
}

const quoteId = (n) => `"${n}"`;
const rowsByTable = new Map(); // table -> [statement text]
const updates = []; // UPDATE statements to run last
const dropped = { pragma: 0, transaction: 0, other: 0 };
const otherKinds = new Map();

for (const stmt of statements) {
  const m = insertHead.exec(stmt);
  if (!m) {
    if (/^PRAGMA\b/i.test(stmt)) dropped.pragma++;
    else if (/^(BEGIN|COMMIT|END)\b/i.test(stmt)) dropped.transaction++;
    else {
      dropped.other++;
      const kind = stmt.split(/\s+/).slice(0, 2).join(" ").toUpperCase();
      otherKinds.set(kind, (otherKinds.get(kind) ?? 0) + 1);
    }
    continue;
  }
  const table = m[1] ?? m[2] ?? m[3] ?? m[4];
  const tableCols = columns[table];
  if (!tableCols) {
    console.error(`ERROR: data contains a table that is not in fk-graph.json: ${table}`);
    process.exit(1);
  }
  const listed = m[5]
    ? m[5].split(",").map((c) => c.trim().replace(/^["`\[]|["`\]]$/g, ""))
    : tableCols;
  const openIdx = m[0].length - 1;
  const { values, end } = splitValues(stmt, openIdx);
  if (stmt.slice(end + 1).trim() !== "") {
    console.error(`ERROR: multi-row INSERT found in table ${table}; this script expects one row per INSERT`);
    process.exit(1);
  }
  if (values.length !== listed.length) {
    console.error(`ERROR: table ${table}: ${values.length} values but ${listed.length} columns`);
    process.exit(1);
  }

  let outStmt = stmt;
  const hits = deferred.filter((d) => d.table === table);
  if (hits.length) {
    const newValues = [...values];
    for (const d of hits) {
      const ci = listed.indexOf(d.column);
      const pi = listed.indexOf(d.primaryKey);
      if (ci < 0 || pi < 0) {
        console.error(`ERROR: ${table}: cannot find ${d.column} / ${d.primaryKey} in the INSERT`);
        process.exit(1);
      }
      if (!/^NULL$/i.test(values[ci])) {
        updates.push(
          `UPDATE ${quoteId(table)} SET ${quoteId(d.column)} = ${values[ci]} WHERE ${quoteId(d.primaryKey)} = ${values[pi]}`
        );
        newValues[ci] = "NULL";
      }
    }
    outStmt = stmt.slice(0, openIdx + 1) + newValues.join(",") + ")";
  }
  if (!rowsByTable.has(table)) rowsByTable.set(table, []);
  rowsByTable.get(table).push(outStmt);
}

// ---------- 3. order tables: parents first ----------
const tables = Object.keys(columns);
const deps = new Map(tables.map((t) => [t, new Set()]));
for (const fk of graph.foreignKeys) {
  if (fk.table === fk.references) continue; // self-reference handled by deferredColumns
  if (deferredKey.has(`${fk.table}.${fk.column}`)) continue;
  if (!deps.has(fk.references)) continue;
  deps.get(fk.table).add(fk.references);
}
const order = [];
const done = new Set();
while (order.length < tables.length) {
  const ready = tables.filter((t) => !done.has(t) && [...deps.get(t)].every((p) => done.has(p)));
  if (!ready.length) {
    console.error("ERROR: unresolved foreign-key loop among: " + tables.filter((t) => !done.has(t)).join(", "));
    process.exit(1);
  }
  for (const t of ready.sort()) {
    order.push(t);
    done.add(t);
  }
}

// ---------- 4. write ----------
const out = [];
let total = 0;
const report = [];
for (const t of order) {
  const rows = rowsByTable.get(t);
  if (!rows) continue;
  out.push(...rows);
  total += rows.length;
  report.push([t, rows.length]);
}
out.push(...updates);

writeFileSync(outPath, out.map((s) => s + ";").join("\n") + "\n", { encoding: "utf8" });

console.log("Tables with rows, in load order (table: rows):");
for (const [t, n] of report) console.log(`  ${t}: ${n}`);
console.log(`Total INSERT statements: ${total}`);
console.log(`Follow-up UPDATE statements (loop columns): ${updates.length}`);
console.log(`Dropped: ${dropped.pragma} PRAGMA, ${dropped.transaction} BEGIN/COMMIT, ${dropped.other} other`);
if (dropped.other) {
  console.log("Other statement kinds that were dropped (name only): " + [...otherKinds].map(([k, n]) => `${k} x${n}`).join(", "));
}
console.log(`Wrote ${outPath}`);
