import {
  validateDocument,
  compareId,
  validDuration,
  InputError,
} from "./model.mjs";

export class CycleError extends InputError {
  constructor(cycle, tasks) {
    const names = new Map(tasks.map((task) => [task.id, task.name]));
    super(
      `Siklus ketergantungan: ${cycle.map((id) => names.get(id)).join(" → ")}. Lepaskan salah satu prasyarat.`,
    );
    this.name = "CycleError";
    this.cycle = cycle;
  }
}
function findCycle(ids, successors) {
  const color = new Map(),
    stack = [];
  function visit(id) {
    color.set(id, 1);
    stack.push(id);
    for (const next of successors.get(id)) {
      if (color.get(next) === 1)
        return [...stack.slice(stack.indexOf(next)), next];
      if (!color.has(next)) {
        const result = visit(next);
        if (result) return result;
      }
    }
    stack.pop();
    color.set(id, 2);
    return null;
  }
  for (const id of ids)
    if (!color.has(id)) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  return [];
}

/** CPM dengan kapasitas kerja paralel tak terbatas, waktu mulai proyek = 0. */
export function planProject(input) {
  const document = validateDocument(input),
    tasks = document.tasks,
    ids = tasks.map((task) => task.id);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const successors = new Map(ids.map((id) => [id, []])),
    indegree = new Map(tasks.map((task) => [task.id, task.dependsOn.length]));
  for (const task of tasks)
    for (const dep of task.dependsOn) successors.get(dep).push(task.id);
  for (const list of successors.values()) list.sort(compareId);
  const ready = tasks
      .filter((task) => !task.dependsOn.length)
      .map((task) => task.id),
    order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const next of successors.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort(compareId);
      }
    }
  }
  if (order.length !== ids.length)
    throw new CycleError(findCycle(ids, successors), tasks);
  const timings = new Map();
  for (const id of order) {
    const task = byId.get(id);
    const earliestStart = Math.max(
      0,
      ...task.dependsOn.map((dep) => timings.get(dep).earliestFinish),
    );
    const level =
      Math.max(-1, ...task.dependsOn.map((dep) => timings.get(dep).level)) + 1;
    timings.set(id, {
      id,
      name: task.name,
      duration: task.duration,
      earliestStart,
      earliestFinish: earliestStart + task.duration,
      level,
    });
  }
  const duration = Math.max(
    0,
    ...[...timings.values()].map((row) => row.earliestFinish),
  );
  for (const id of [...order].reverse()) {
    const row = timings.get(id),
      next = successors.get(id);
    row.latestFinish = next.length
      ? Math.min(...next.map((child) => timings.get(child).latestStart))
      : duration;
    row.latestStart = row.latestFinish - row.duration;
    row.slack = row.latestStart - row.earliestStart;
    row.critical = row.slack === 0;
  }
  const rows = ids.map((id) => ({
    ...timings.get(id),
    dependsOn: [...byId.get(id).dependsOn],
    successors: [...successors.get(id)],
  }));
  const edges = [];
  for (const row of rows)
    for (const child of row.successors) {
      const to = timings.get(child);
      edges.push({
        from: row.id,
        to: child,
        critical:
          row.critical &&
          to.critical &&
          row.earliestFinish === to.earliestStart,
      });
    }
  const criticalPath = [];
  // Satu jalur saksi deterministik; tidak mengenumerasi jalur yang jumlahnya eksponensial.
  let cursor = rows
    .filter((row) => row.critical && !row.dependsOn.length)
    .map((row) => row.id)
    .sort(compareId)[0];
  while (cursor) {
    criticalPath.push(cursor);
    cursor = edges
      .filter((edge) => edge.from === cursor && edge.critical)
      .map((edge) => edge.to)
      .sort(compareId)[0];
  }
  return {
    duration,
    taskCount: tasks.length,
    edgeCount: edges.length,
    order,
    rows,
    edges,
    criticalPath,
    criticalCount: rows.filter((row) => row.critical).length,
  };
}
export function simulateDuration(document, id, duration) {
  validDuration(duration);
  const next = validateDocument(document),
    task = next.tasks.find((task) => task.id === id);
  if (!task) throw new InputError("Pilih tugas untuk simulasi.");
  const before = planProject(next);
  task.duration = duration;
  const after = planProject(next);
  return {
    document: next,
    before,
    after,
    savedHours: before.duration - after.duration,
  };
}
