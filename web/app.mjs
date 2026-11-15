import { blankDocument, LIMITS, upsertTask, removeTask } from "./model.mjs";
import { planProject, simulateDuration } from "./planner.mjs";
import {
  ProjectSession,
  parseBackup,
  serializeBackup,
  STORAGE_KEY,
} from "./storage.mjs";
import { timelineSvg, graphSvg } from "./diagrams.mjs";
import { DEMO } from "./example.mjs";

const $ = (id) => document.getElementById(id),
  format = (value) => new Intl.NumberFormat("id-ID").format(value);
let session = null,
  documentState = blankDocument(),
  plan = planProject(documentState),
  selected = "",
  view = "timeline",
  draftId = null,
  simulation = null,
  pendingAction = null,
  toastTimer;
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notify(message, error = false) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  toastTimer = setTimeout(
    () => {
      $("toast").hidden = true;
    },
    error ? 8500 : 4500,
  );
}
function showError(id, error) {
  $(id).textContent = error.message || "Perubahan belum dapat disimpan.";
  $(id).hidden = false;
}
function clearError(id) {
  $(id).hidden = true;
  $(id).textContent = "";
}
function openDialog(id) {
  if (!$(id).open) $(id).showModal();
}
function closeDialogs() {
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
}
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
function install(result) {
  documentState = result.document;
  plan = result.plan;
  if (!plan.rows.some((row) => row.id === selected))
    selected = plan.criticalPath[0] || plan.rows[0]?.id || "";
  render();
}
function save(candidate, message) {
  install(session.commit(candidate));
  $("save-state").textContent = "Rencana valid tersimpan di browser ini.";
  if (message) notify(message);
}
function confirm(title, description, action, label = "Lanjutkan") {
  $("confirm-title").textContent = title;
  $("confirm-description").textContent = description;
  $("confirm-action").textContent = label;
  clearError("confirm-error");
  pendingAction = action;
  openDialog("confirm-dialog");
}
$("confirm-action").addEventListener("click", () => {
  try {
    pendingAction?.();
    $("confirm-dialog").close();
  } catch (error) {
    showError("confirm-error", error);
  }
});
$("confirm-dialog").addEventListener("close", () => {
  pendingAction = null;
});

function render() {
  $("project-title").textContent = documentState.title;
  $("project-duration").textContent = format(plan.duration);
  $("critical-summary").textContent = plan.taskCount
    ? `${plan.criticalCount} tugas kritis · ${plan.taskCount} tugas total`
    : "Belum ada tugas";
  $("plan-description").textContent = plan.taskCount
    ? "Durasi dan urutan prasyarat menentukan hasil perhitungan."
    : "Tambahkan tugas atau muat contoh untuk memulai.";
  $("plan-valid").hidden = !plan.taskCount;
  $("task-count").textContent =
    `${plan.taskCount} / ${LIMITS.tasks} tugas · ${plan.edgeCount} hubungan`;
  $("task-empty").hidden = Boolean(plan.taskCount);
  $("task-list").replaceChildren();
  const byId = new Map(plan.rows.map((row) => [row.id, row]));
  plan.order.forEach((id, index) => {
    const row = byId.get(id),
      button = element(
        "button",
        `task-item ${row.critical ? "critical" : ""} ${id === selected ? "selected" : ""}`,
      );
    button.type = "button";
    button.setAttribute("aria-label", `Pilih tugas ${row.name}`);
    button.setAttribute("aria-pressed", String(id === selected));
    const text = element("span", "task-copy");
    text.append(
      element("strong", "", row.name),
      element(
        "small",
        "",
        row.dependsOn.length
          ? `${row.dependsOn.length} prasyarat`
          : "Bisa dimulai langsung",
      ),
    );
    button.append(
      element("span", "task-index", String(index + 1).padStart(2, "0")),
      text,
      element("span", "task-duration", `${row.duration}j`),
    );
    button.addEventListener("click", () => selectTask(id));
    $("task-list").append(button);
  });
  $("selected-task").replaceChildren();
  for (const row of plan.rows)
    $("selected-task").add(new Option(row.name, row.id));
  $("selected-task").value = selected;
  $("local-state").textContent = session?.raw
    ? "Tersimpan di browser ini"
    : "Lokal · tanpa akun";
  renderDiagram();
  renderDetails();
  renderCriticalPath();
}
function renderDiagram() {
  $("diagram-empty").hidden = Boolean(plan.taskCount);
  $("diagram").hidden = !plan.taskCount;
  $("diagram").innerHTML = plan.taskCount
    ? view === "timeline"
      ? timelineSvg(plan, selected)
      : graphSvg(plan, selected)
    : "";
  $("edge-count").textContent = `${plan.edgeCount} hubungan`;
  $("timeline-button").classList.toggle("active", view === "timeline");
  $("graph-button").classList.toggle("active", view === "graph");
  $("timeline-button").setAttribute(
    "aria-pressed",
    String(view === "timeline"),
  );
  $("graph-button").setAttribute("aria-pressed", String(view === "graph"));
  $("svg-button").disabled = !plan.taskCount;
}
function renderDetails() {
  const row = plan.rows.find((row) => row.id === selected);
  $("edit-task").disabled = !row;
  $("delete-task").disabled = !row;
  $("simulation-duration").disabled = !row;
  $("selected-task").disabled = !row;
  for (const [id, value] of [
    ["detail-es", row?.earliestStart],
    ["detail-ef", row?.earliestFinish],
    ["detail-ls", row?.latestStart],
    ["detail-slack", row?.slack],
  ])
    $(id).textContent = value === undefined ? "—" : `${format(value)} jam`;
  $("detail-explanation").textContent = row
    ? row.critical
      ? "Tugas ini kritis: tidak memiliki kelonggaran dalam rencana saat ini."
      : `Tugas ini bisa ditunda hingga ${row.slack} jam dari waktu paling awal tanpa mengubah durasi minimum model.`
    : "Pilih sebuah tugas untuk melihat waktu dan kelonggarannya.";
  const names = new Map(plan.rows.map((task) => [task.id, task.name]));
  $("dependency-copy").textContent = row
    ? row.dependsOn.length
      ? "Menunggu: " + row.dependsOn.map((id) => names.get(id)).join(", ")
      : "Tanpa prasyarat. Bisa dimulai pada jam 0."
    : "";
  $("simulation-task").textContent = row
    ? `Ubah durasi “${row.name}” untuk melihat dampaknya.`
    : "Pilih tugas dari rincian waktu.";
  $("simulation-duration").value = row ? String(row.duration) : "";
  updateSimulation();
}
function selectTask(id) {
  selected = id;
  $("selected-task").value = id;
  render();
}
$("selected-task").addEventListener("change", () =>
  selectTask($("selected-task").value),
);
$("diagram").addEventListener("click", (event) => {
  const task = event.target.closest("[data-task-id]");
  if (task) selectTask(task.dataset.taskId);
});
$("diagram").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const task = event.target.closest("[data-task-id]");
  if (task) {
    event.preventDefault();
    selectTask(task.dataset.taskId);
  }
});
["timeline", "graph"].forEach((next) =>
  $(next + "-button").addEventListener("click", () => {
    view = next;
    renderDiagram();
  }),
);
function renderCriticalPath() {
  $("critical-path").replaceChildren();
  const names = new Map(plan.rows.map((row) => [row.id, row.name]));
  if (!plan.criticalPath.length) {
    $("critical-path").textContent = "Belum ada tugas.";
    return;
  }
  plan.criticalPath.forEach((id, index) => {
    if (index) $("critical-path").append(element("span", "path-arrow", "→"));
    const button = element("button", "path-task", names.get(id));
    button.type = "button";
    button.addEventListener("click", () => selectTask(id));
    $("critical-path").append(button);
  });
}
function updateSimulation() {
  simulation = null;
  $("apply-simulation").disabled = true;
  if (!selected) {
    $("simulation-total").textContent = "—";
    $("simulation-result").textContent =
      "Hasil simulasi akan muncul setelah ada tugas.";
    return;
  }
  try {
    simulation = simulateDuration(
      documentState,
      selected,
      Number($("simulation-duration").value),
    );
    const delta = simulation.savedHours,
      changed =
        documentState.tasks.find((task) => task.id === selected).duration !==
        Number($("simulation-duration").value);
    $("simulation-total").textContent =
      `${format(simulation.after.duration)} jam`;
    $("simulation-result").textContent =
      delta > 0
        ? `Proyek lebih cepat ${delta} jam: ${plan.duration} → ${simulation.after.duration} jam.`
        : delta < 0
          ? `Durasi proyek bertambah ${-delta} jam: ${plan.duration} → ${simulation.after.duration} jam.`
          : changed
            ? "Durasi proyek tetap. Jalur lain masih menentukan waktu selesai."
            : "Ubah durasi untuk membandingkan hasil.";
    $("simulation-result").classList.remove("invalid");
    $("apply-simulation").disabled = !changed;
  } catch (error) {
    $("simulation-total").textContent = "—";
    $("simulation-result").textContent = error.message;
    $("simulation-result").classList.add("invalid");
  }
}
$("simulation-duration").addEventListener("input", updateSimulation);
$("apply-simulation").addEventListener("click", () => {
  if (!simulation) return;
  try {
    save(
      simulation.document,
      "Durasi simulasi diterapkan. Rencana dihitung ulang.",
    );
  } catch (error) {
    notify(error.message, true);
  }
});

function openTask(id = null) {
  const task = documentState.tasks.find((task) => task.id === id);
  draftId = task?.id || `t-${crypto.randomUUID()}`;
  $("task-form").reset();
  clearError("task-error");
  $("task-dialog-title").textContent = task ? "Ubah tugas" : "Tambah tugas";
  $("task-name").value = task?.name || "";
  $("task-duration").value = String(task?.duration || 1);
  $("prerequisite-list").replaceChildren();
  for (const other of documentState.tasks.filter((row) => row.id !== draftId)) {
    const label = element("label", "prerequisite");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.value = other.id;
    checkbox.checked = Boolean(task?.dependsOn.includes(other.id));
    label.append(
      checkbox,
      element("span", "", other.name),
      element("small", "", `${other.duration} jam`),
    );
    $("prerequisite-list").append(label);
  }
  $("no-prerequisites").hidden = Boolean(
    $("prerequisite-list").children.length,
  );
  openDialog("task-dialog");
}
$("add-task").addEventListener("click", () => openTask());
$("edit-task").addEventListener("click", () => openTask(selected));
$("task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  clearError("task-error");
  try {
    const task = {
      id: draftId,
      name: $("task-name").value,
      duration: Number($("task-duration").value),
      dependsOn: [
        ...$("prerequisite-list").querySelectorAll("input:checked"),
      ].map((checkbox) => checkbox.value),
    };
    const result = session.commit(upsertTask(documentState, task));
    selected = task.id;
    install(result);
    $("task-dialog").close();
    $("save-state").textContent = "Rencana valid tersimpan di browser ini.";
    notify("Tugas disimpan. Perhitungan diperbarui.");
  } catch (error) {
    showError("task-error", error);
  }
});
$("delete-task").addEventListener("click", () => {
  const task = documentState.tasks.find((row) => row.id === selected);
  if (!task) return;
  try {
    const candidate = removeTask(documentState, task.id);
    confirm(
      "Hapus tugas?",
      `“${task.name}” akan dihapus. Tugas ini tidak sedang menjadi prasyarat tugas lain.`,
      () => save(candidate, "Tugas dihapus."),
      "Ya, hapus",
    );
  } catch (error) {
    notify(error.message, true);
  }
});
$("rename-project").addEventListener("click", () => {
  $("project-name-input").value = documentState.title;
  clearError("rename-error");
  openDialog("project-dialog");
});
$("rename-form").addEventListener("submit", (event) => {
  event.preventDefault();
  clearError("rename-error");
  try {
    save(
      { ...documentState, title: $("project-name-input").value },
      "Nama proyek disimpan.",
    );
    $("project-dialog").close();
  } catch (error) {
    showError("rename-error", error);
  }
});
function loadExample() {
  confirm(
    "Ganti dengan rencana contoh?",
    "Contoh sintetis berisi tujuh tugas untuk demo aplikasi kelompok. Rencana aktif diganti; unduh backup terlebih dahulu jika diperlukan.",
    () =>
      save(
        structuredClone(DEMO),
        "Contoh dimuat. Durasi minimum model: 16 jam.",
      ),
    "Muat contoh",
  );
}
$("example-button").addEventListener("click", loadExample);
$("start-example").addEventListener("click", loadExample);

function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    link = element("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
$("backup-button").addEventListener("click", () => {
  try {
    download(
      serializeBackup(documentState),
      "jalurproyek-backup.json",
      "application/json;charset=utf-8",
    );
    notify("Backup JSON disiapkan untuk diunduh.");
  } catch (error) {
    notify(error.message, true);
  }
});
$("svg-button").addEventListener("click", () => {
  download(
    view === "timeline"
      ? timelineSvg(plan, selected)
      : graphSvg(plan, selected),
    `jalurproyek-${view}.svg`,
    "image/svg+xml;charset=utf-8",
  );
  notify("Diagram SVG disiapkan untuk diunduh.");
});
$("import-button").addEventListener("click", () => {
  $("import-text").value = "";
  clearError("import-error");
  openDialog("import-dialog");
});
$("import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  clearError("import-error");
  try {
    const candidate = parseBackup($("import-text").value);
    save(candidate, "Backup valid berhasil diimpor.");
    $("import-dialog").close();
  } catch (error) {
    showError("import-error", error);
  }
});
$("help-button").addEventListener("click", () => openDialog("help-dialog"));

const mainActions = [
  "add-task",
  "example-button",
  "start-example",
  "import-button",
  "backup-button",
  "rename-project",
  "edit-task",
  "delete-task",
  "apply-simulation",
  "svg-button",
];
function loadStored() {
  try {
    if (!session) session = new ProjectSession(window.localStorage);
    const result = session.load();
    closeDialogs();
    install(result);
    $("storage-alert").hidden = true;
    $("external-change").hidden = true;
    for (const id of mainActions) $(id).disabled = false;
    render();
    $("save-state").textContent = session.raw
      ? "Rencana terakhir berhasil dimuat."
      : "Siap menyusun rencana.";
  } catch (error) {
    $("storage-alert-text").textContent =
      error.message +
      " Data tidak dihapus otomatis. Unduh salinan sebelum reset.";
    $("storage-alert").hidden = false;
    for (const id of mainActions) $(id).disabled = true;
    $("local-state").textContent = "Penyimpanan perlu diperiksa";
  }
}
$("retry-load").addEventListener("click", loadStored);
$("reload-project").addEventListener("click", loadStored);
$("raw-backup").addEventListener("click", () => {
  try {
    const raw = session?.readRaw();
    if (!raw) throw new Error("Tidak ada data lokal yang dapat diunduh.");
    download(raw, "jalurproyek-pemulihan.json", "application/json");
  } catch (error) {
    notify(error.message, true);
  }
});
$("reset-storage").addEventListener("click", () =>
  confirm(
    "Reset data lokal?",
    "Rencana pada browser ini akan diganti dengan proyek kosong. Simpan salinan data terlebih dahulu jika diperlukan.",
    () => {
      if (!session) session = new ProjectSession(window.localStorage);
      session.reset();
      loadStored();
      notify("Data lokal direset.");
    },
    "Ya, reset data",
  ),
);
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null)
    $("external-change").hidden = false;
});
render();
loadStored();
