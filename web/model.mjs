export const LIMITS = Object.freeze({
  tasks: 40,
  edges: 150,
  duration: 720,
  backupBytes: 256000,
});
export const compareId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}
function requireThat(condition, message) {
  if (!condition) throw new InputError(message);
}
function keys(value, expected, label) {
  requireThat(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} harus berupa objek.`,
  );
  requireThat(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort()),
    `Struktur ${label} tidak sesuai format JalurProyek v1.`,
  );
}
function text(value, limit, label) {
  requireThat(typeof value === "string", `${label} harus berupa teks.`);
  const result = value.trim().normalize("NFC");
  requireThat(
    result.length > 0 &&
      result.length <= limit &&
      !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff\ufffe\uffff]/u.test(result),
    `${label} harus 1–${limit} karakter Unicode valid tanpa karakter kontrol.`,
  );
  return result;
}
export function validDuration(value) {
  requireThat(
    Number.isSafeInteger(value) && value >= 1 && value <= LIMITS.duration,
    `Durasi harus bilangan bulat 1–${LIMITS.duration} jam.`,
  );
  return value;
}
export function blankDocument() {
  return { schemaVersion: 1, title: "Rencana proyek baru", tasks: [] };
}

/** Validasi struktur; siklus diperiksa oleh planner sebelum penyimpanan. */
export function validateDocument(input) {
  keys(input, ["schemaVersion", "title", "tasks"], "dokumen");
  requireThat(
    input.schemaVersion === 1,
    "Versi backup belum didukung. Gunakan JalurProyek v1.",
  );
  requireThat(
    Array.isArray(input.tasks) && input.tasks.length <= LIMITS.tasks,
    `Proyek maksimal ${LIMITS.tasks} tugas.`,
  );
  const seen = new Set();
  let edgeCount = 0;
  const tasks = input.tasks
    .map((task) => {
      keys(task, ["id", "name", "duration", "dependsOn"], "tugas");
      requireThat(
        typeof task.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(task.id),
        "ID tugas tidak valid.",
      );
      requireThat(!seen.has(task.id), "ID tugas terduplikasi.");
      seen.add(task.id);
      requireThat(
        Array.isArray(task.dependsOn) && task.dependsOn.length <= LIMITS.tasks,
        "Daftar prasyarat tidak valid.",
      );
      const deps = new Set();
      for (const id of task.dependsOn) {
        requireThat(
          typeof id === "string" && id !== task.id,
          "Tugas tidak boleh menjadi prasyarat dirinya sendiri.",
        );
        requireThat(!deps.has(id), "Prasyarat terduplikasi.");
        deps.add(id);
      }
      edgeCount += deps.size;
      return {
        id: task.id,
        name: text(task.name, 80, "Nama tugas"),
        duration: validDuration(task.duration),
        dependsOn: [...deps].sort(compareId),
      };
    })
    .sort((a, b) => compareId(a.id, b.id));
  requireThat(
    edgeCount <= LIMITS.edges,
    `Proyek maksimal ${LIMITS.edges} hubungan prasyarat.`,
  );
  for (const task of tasks)
    for (const id of task.dependsOn)
      requireThat(
        seen.has(id),
        `Prasyarat pada “${task.name}” merujuk tugas yang tidak ada.`,
      );
  return {
    schemaVersion: 1,
    title: text(input.title, 80, "Nama proyek"),
    tasks,
  };
}
export function upsertTask(document, task) {
  const next = validateDocument(document),
    index = next.tasks.findIndex((row) => row.id === task.id);
  if (index < 0) next.tasks.push(task);
  else next.tasks[index] = task;
  return validateDocument(next);
}
export function removeTask(document, id) {
  const next = validateDocument(document);
  const dependents = next.tasks.filter((task) => task.dependsOn.includes(id));
  requireThat(
    !dependents.length,
    `Tugas masih menjadi prasyarat: ${dependents.map((task) => task.name).join(", ")}. Lepaskan hubungan itu sebelum menghapus.`,
  );
  next.tasks = next.tasks.filter((task) => task.id !== id);
  return next;
}
