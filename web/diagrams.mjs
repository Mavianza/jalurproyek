/** SVG mandiri, seluruh teks dinamis di-escape untuk konteks XML. */
export const escapeXml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );
const colors = {
  ink: "#28334b",
  muted: "#818aa0",
  line: "#e7eaf1",
  normal: "#6979be",
  critical: "#b66044",
  slack: "#c7cfe7",
  selected: "#4a50a4",
};
const label = (text, x, y, attrs = "") =>
  `<text x="${x}" y="${y}" font-family="Segoe UI,Arial,sans-serif" ${attrs}>${escapeXml(text)}</text>`;
function wrap(text, max = 22) {
  const words = text.split(/\s+/u),
    lines = [];
  let line = "";
  for (const word of words) {
    if (Array.from((line + " " + word).trim()).length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines.flatMap((part) => {
    const chars = Array.from(part);
    return chars.length > max
      ? Array.from({ length: Math.ceil(chars.length / max) }, (_, i) =>
          chars.slice(i * max, (i + 1) * max).join(""),
        )
      : [part];
  });
}
function root(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title><rect width="100%" height="100%" fill="#ffffff"/>${body}</svg>`;
}
export function timelineSvg(plan, selected = "") {
  const rows = [...plan.rows].sort(
    (a, b) => a.earliestStart - b.earliestStart || (a.id < b.id ? -1 : 1),
  );
  const width = 940,
    left = 232,
    right = 34,
    top = 65,
    rowHeight = 59,
    height = Math.max(180, top + rows.length * rowHeight + 28),
    scale = (width - left - right) / Math.max(1, plan.duration);
  let body =
    label(
      "TUGAS / DURASI",
      22,
      29,
      'font-size="11" font-weight="700" fill="#818aa0"',
    ) +
    label(
      "JAM DARI AWAL PROYEK",
      left,
      29,
      'font-size="11" font-weight="700" fill="#818aa0"',
    );
  const step = Math.max(1, Math.ceil(plan.duration / 8));
  const ticks = [];
  for (let t = 0; t <= plan.duration; t += step) ticks.push(t);
  if (!ticks.includes(plan.duration)) ticks.push(plan.duration);
  for (const t of ticks) {
    const x = left + t * scale;
    body +=
      `<line x1="${x}" y1="42" x2="${x}" y2="${height - 16}" stroke="${colors.line}"/>` +
      label(t, x, 53, 'font-size="11" text-anchor="middle" fill="#818aa0"');
  }
  rows.forEach((row, i) => {
    const y = top + i * rowHeight,
      x = left + row.earliestStart * scale,
      barWidth = row.duration * scale;
    const nameLines = wrap(row.name, 27).slice(0, 2);
    body += `<g role="button" tabindex="0" data-task-id="${escapeXml(row.id)}" aria-label="${escapeXml("Pilih tugas " + row.name)}"><title>${escapeXml(`${row.name}: mulai ${row.earliestStart}, selesai ${row.earliestFinish}, kelonggaran ${row.slack} jam`)}</title><rect x="10" y="${y - 7}" width="920" height="55" rx="8" fill="${row.id === selected ? "#f3f3fc" : "#fff"}"/>`;
    nameLines.forEach((line, j) => {
      body += label(
        line,
        22,
        y + 9 + j * 14,
        'font-size="12" font-weight="600" fill="#28334b"',
      );
    });
    body += label(
      `${row.duration} jam${row.critical ? " · kritis" : ""}`,
      22,
      y + 40,
      'font-size="10" fill="#818aa0"',
    );
    if (row.slack)
      body += `<line x1="${x + barWidth}" y1="${y + 17}" x2="${left + row.latestFinish * scale}" y2="${y + 17}" stroke="${colors.slack}" stroke-width="4" stroke-dasharray="5 4"/>`;
    body += `<rect x="${x}" y="${y + 3}" width="${Math.max(0.1, barWidth)}" height="29" rx="5" fill="${row.critical ? colors.critical : colors.normal}" ${row.id === selected ? 'stroke="#26334b" stroke-width="2"' : ""}/>`;
    if (barWidth > 30)
      body += label(
        `${row.duration}j`,
        x + barWidth / 2,
        y + 22,
        'font-size="11" text-anchor="middle" fill="#fff" font-weight="600"',
      );
    body += "</g>";
  });
  return root(width, height, "Timeline CPM — " + plan.duration + " jam", body);
}
export function graphSvg(plan, selected = "") {
  const levels = new Map();
  for (const row of plan.rows) {
    if (!levels.has(row.level)) levels.set(row.level, []);
    levels.get(row.level).push(row);
  }
  const maxLevel = Math.max(0, ...levels.keys()),
    maxRows = Math.max(1, ...[...levels.values()].map((list) => list.length));
  const nodeWidth = 166,
    nodeHeight = 99,
    column = 210,
    rowGap = 132,
    width = Math.max(780, 45 + (maxLevel + 1) * column),
    height = Math.max(270, 65 + maxRows * rowGap),
    positions = new Map();
  for (const [level, rows] of levels) {
    rows.sort((a, b) => (a.id < b.id ? -1 : 1));
    rows.forEach((row, i) =>
      positions.set(row.id, {
        x: 28 + level * column,
        y: 42 + (height - 75 - rows.length * rowGap) / 2 + i * rowGap,
      }),
    );
  }
  let body = `<defs><marker id="edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#bdc6d7"/></marker><marker id="critical-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#b66044"/></marker></defs>`;
  for (const edge of plan.edges) {
    const from = positions.get(edge.from),
      to = positions.get(edge.to),
      start = from.x + nodeWidth,
      end = to.x,
      middle = (start + end) / 2;
    body += `<path d="M${start} ${from.y + nodeHeight / 2} H${middle} V${to.y + nodeHeight / 2} H${end - 3}" fill="none" stroke="${edge.critical ? colors.critical : "#bdc6d7"}" stroke-width="${edge.critical ? 2 : 1.5}" marker-end="url(#${edge.critical ? "critical-arrow" : "edge-arrow"})"/>`;
  }
  for (const row of plan.rows) {
    const p = positions.get(row.id),
      nameLines = wrap(row.name, 21).slice(0, 3);
    body +=
      `<g data-task-id="${escapeXml(row.id)}" role="button" tabindex="0" aria-label="${escapeXml("Pilih tugas " + row.name)}"><title>${escapeXml(row.name)}</title><rect x="${p.x}" y="${p.y}" width="${nodeWidth}" height="${nodeHeight}" rx="11" fill="${row.critical ? "#fcf2ed" : "#f5f6fc"}" stroke="${row.id === selected ? "#28334b" : row.critical ? "#ddb7a6" : "#d8deed"}" stroke-width="${row.id === selected ? 2 : 1}"/>` +
      label(
        `${row.duration} JAM`,
        p.x + 12,
        p.y + 19,
        'font-size="9" font-weight="700" fill="#818aa0"',
      );
    nameLines.forEach((line, i) => {
      body += label(
        line,
        p.x + 12,
        p.y + 38 + i * 14,
        'font-size="11" font-weight="600" fill="#28334b"',
      );
    });
    body +=
      label(
        `Mulai ${row.earliestStart} · selesai ${row.earliestFinish}`,
        p.x + 12,
        p.y + 88,
        'font-size="9" fill="#818aa0"',
      ) + "</g>";
  }
  return root(width, height, "Graf ketergantungan tugas", body);
}
