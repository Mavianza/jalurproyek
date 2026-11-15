import test from "node:test";
import assert from "node:assert/strict";
import {
  blankDocument,
  validateDocument,
  validDuration,
  upsertTask,
  removeTask,
} from "../web/model.mjs";
import { CycleError, planProject, simulateDuration } from "../web/planner.mjs";
import { DEMO } from "../web/example.mjs";
import { timelineSvg, graphSvg } from "../web/diagrams.mjs";

const task = (id, duration = 1, dependsOn = []) => ({
  id,
  name: `Tugas ${id}`,
  duration,
  dependsOn,
});
const document = (tasks) => ({ ...blankDocument(), tasks });
const row = (plan, id) => plan.rows.find((item) => item.id === id);

test("contoh kelompok: CPM 16 jam, dua tugas punya kelonggaran", () => {
  const plan = planProject(DEMO);
  assert.equal(plan.duration, 16);
  assert.equal(plan.taskCount, 7);
  assert.equal(plan.edgeCount, 8);
  assert.deepEqual(plan.criticalPath, ["A", "C", "D", "E", "G"]);
  assert.deepEqual(
    plan.rows.map((r) => [
      r.id,
      r.earliestStart,
      r.earliestFinish,
      r.latestStart,
      r.slack,
    ]),
    [
      ["A", 0, 2, 0, 0],
      ["B", 2, 5, 3, 1],
      ["C", 2, 6, 2, 0],
      ["D", 6, 12, 6, 0],
      ["E", 12, 15, 12, 0],
      ["F", 5, 9, 11, 6],
      ["G", 15, 16, 15, 0],
    ],
  );
});
test("proyek kosong valid dan tidak memiliki jalur kritis", () => {
  const plan = planProject(blankDocument());
  assert.equal(plan.duration, 0);
  assert.deepEqual(plan.criticalPath, []);
  assert.equal(plan.criticalCount, 0);
});
test("banyak komponen dan sink: semua selesai mengikuti durasi proyek yang sama", () => {
  const plan = planProject(
    document([
      task("A", 4),
      task("B", 2, ["A"]),
      task("C", 1),
      task("D", 2, ["C"]),
      task("E", 2),
    ]),
  );
  assert.equal(plan.duration, 6);
  assert.equal(row(plan, "D").slack, 3);
  assert.equal(row(plan, "C").slack, 3);
  assert.equal(row(plan, "E").slack, 4);
  assert.deepEqual(plan.criticalPath, ["A", "B"]);
});
test("dua jalur sama panjang: semua kritis, jalur saksi dipilih menurut ID", () => {
  const plan = planProject(
    document([
      task("A", 1),
      task("B", 3, ["A"]),
      task("C", 3, ["A"]),
      task("D", 1, ["B", "C"]),
    ]),
  );
  assert.equal(plan.duration, 5);
  assert.equal(plan.criticalCount, 4);
  assert.deepEqual(plan.criticalPath, ["A", "B", "D"]);
  assert.equal(plan.edges.filter((e) => e.critical).length, 4);
});
test("urutan input dan prasyarat tidak mengubah hasil satu byte pun", () => {
  const input = structuredClone(DEMO);
  input.tasks.reverse();
  input.tasks.forEach((t) => t.dependsOn.reverse());
  assert.deepEqual(planProject(input), planProject(DEMO));
  assert.deepEqual(validateDocument(input), validateDocument(DEMO));
});
test("identitas dibandingkan case-sensitive tanpa ketergantungan locale", () => {
  const plan = planProject(
    document([task("a"), task("_"), task("Z"), task("A")]),
  );
  assert.deepEqual(plan.order, ["A", "Z", "_", "a"]);
  assert.deepEqual(plan.criticalPath, ["A"]);
});
test("siklus menampilkan lintasan tertutup yang benar", () => {
  const input = document([
    task("A", 1, ["C"]),
    task("B", 1, ["A"]),
    task("C", 1, ["B"]),
    task("D", 1, ["C"]),
  ]);
  assert.throws(
    () => planProject(input),
    (error) => {
      assert.ok(error instanceof CycleError);
      assert.deepEqual(error.cycle, ["A", "B", "C", "A"]);
      assert.match(error.message, /Tugas A → Tugas B → Tugas C → Tugas A/);
      return true;
    },
  );
});
test("simulasi mengubah jalur pembatas tanpa memutasi dokumen asli", () => {
  const original = structuredClone(DEMO),
    result = simulateDuration(original, "C", 1);
  assert.equal(result.before.duration, 16);
  assert.equal(result.after.duration, 15);
  assert.equal(result.savedHours, 1);
  assert.deepEqual(result.after.criticalPath, ["A", "B", "D", "E", "G"]);
  assert.deepEqual(original, DEMO);
  assert.throws(
    () => simulateDuration(original, "tidak-ada", 1),
    /Pilih tugas/,
  );
});
test("durasi bulat dibatasi: tolak koersi, NaN, pecahan, dan nilai di luar rentang", () => {
  for (const bad of [true, false, null, "2", 0, -1, 1.1, 721, NaN, Infinity])
    assert.throws(() => validDuration(bad));
  assert.equal(validDuration(1), 1);
  assert.equal(validDuration(720), 720);
});
test("batas kapasitas dan rujukan wajib valid", () => {
  for (const input of [
    document([task("A"), task("A")]),
    document([task("A", 1, ["X"])]),
    document([task("A", 1, ["A"])]),
    document([task("A"), task("B", 1, ["A", "A"])]),
    document(Array.from({ length: 41 }, (_, i) => task(`T${i}`))),
  ])
    assert.throws(() => planProject(input));
  const dense = Array.from({ length: 20 }, (_, i) =>
    task(
      `T${i}`,
      1,
      Array.from({ length: i }, (_, j) => `T${j}`),
    ),
  );
  assert.throws(() => planProject(document(dense)), /150 hubungan/);
  const chain = Array.from({ length: 40 }, (_, i) =>
    task(`T${i}`, 720, i ? [`T${i - 1}`] : []),
  );
  assert.equal(planProject(document(chain)).duration, 28800);
});
test("schema ketat, nama kosong, karakter XML invalid dan Unicode terpotong ditolak", () => {
  for (const bad of [
    { ...blankDocument(), schemaVersion: 2 },
    { ...blankDocument(), extra: true },
    { ...blankDocument(), title: "   " },
    document([{ ...task("A"), extra: true }]),
    document([{ ...task("A"), name: "x\u0001" }]),
    document([{ ...task("A"), name: "\ud800" }]),
    document([{ ...task("A"), name: "\ufffe" }]),
  ])
    assert.throws(() => validateDocument(bad));
  assert.equal(
    validateDocument({ ...blankDocument(), title: "  Cafe\u0301 📊  " }).title,
    "Café 📊",
  );
});
test("penghapusan prasyarat aktif ditolak; penghapusan daun dan upsert tidak memutasi sumber", () => {
  const input = structuredClone(DEMO);
  assert.throws(() => removeTask(input, "A"), /Desain antarmuka/);
  const removed = removeTask(input, "G");
  assert.equal(removed.tasks.length, 6);
  assert.deepEqual(input, DEMO);
  const changed = upsertTask(input, { ...input.tasks[0], duration: 9 });
  assert.equal(changed.tasks.find((t) => t.id === "A").duration, 9);
  assert.deepEqual(input, DEMO);
});
test("SVG meng-escape input XML dan menjaga pasangan Unicode ketika membungkus label", () => {
  const name = '<script>alert("x")</script> & 📊',
    input = document([{ ...task("A"), name }]);
  for (const render of [timelineSvg, graphSvg]) {
    const svg = render(planProject(input));
    assert.ok(svg.startsWith("<svg xmlns="));
    assert.ok(svg.includes("&lt;script&gt;"));
    assert.ok(!svg.includes("<script>"));
    assert.ok(!svg.includes('alert("x")'));
    assert.ok(svg.includes("📊"));
    assert.ok(!svg.includes("\ufffd"));
    const long = render(
      planProject(
        document([{ ...task("A"), name: "a".repeat(20) + "📊".repeat(15) }]),
      ),
    );
    assert.ok(!long.includes("\ufffd"));
    assert.ok(!/[\ud800-\udfff]/u.test(long));
  }
});

// Oracle independen: enumerasi seluruh jalur root→sink, tanpa lintasan maju/mundur CPM.
function pathOracle(tasks) {
  const successors = new Map(
      tasks.map((t) => [
        t.id,
        tasks.filter((s) => s.dependsOn.includes(t.id)).map((s) => s.id),
      ]),
    ),
    byId = new Map(tasks.map((t) => [t.id, t])),
    paths = [];
  function walk(id, ids, total) {
    const next = successors.get(id),
      path = [...ids, id],
      sum = total + byId.get(id).duration;
    if (!next.length) paths.push({ ids: path, duration: sum });
    else for (const child of next) walk(child, path, sum);
  }
  for (const root of tasks.filter((t) => !t.dependsOn.length))
    walk(root.id, [], 0);
  const duration = Math.max(...paths.map((p) => p.duration));
  return {
    duration,
    slack: new Map(
      tasks.map((t) => [
        t.id,
        duration -
          Math.max(
            ...paths.filter((p) => p.ids.includes(t.id)).map((p) => p.duration),
          ),
      ]),
    ),
  };
}
test("200 DAG kecil cocok dengan oracle seluruh jalur, termasuk fork/join dan komponen terpisah", () => {
  let seed = 91873;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let sample = 0; sample < 200; sample++) {
    const count = 2 + Math.floor(random() * 7),
      tasks = [];
    for (let i = 0; i < count; i++)
      tasks.push(
        task(
          `T${i}`,
          1 + Math.floor(random() * 12),
          tasks.filter(() => random() < 0.35).map((t) => t.id),
        ),
      );
    const plan = planProject(document(tasks)),
      oracle = pathOracle(tasks);
    assert.equal(plan.duration, oracle.duration, `sample ${sample}`);
    for (const r of plan.rows) {
      assert.equal(r.slack, oracle.slack.get(r.id));
      assert.ok(r.slack >= 0);
      for (const dep of r.dependsOn)
        assert.ok(row(plan, dep).earliestFinish <= r.earliestStart);
    }
    assert.equal(
      plan.criticalPath.reduce((sum, id) => sum + row(plan, id).duration, 0),
      plan.duration,
    );
    assert.deepEqual(
      planProject(
        document(
          [...tasks]
            .reverse()
            .map((t) => ({ ...t, dependsOn: [...t.dependsOn].reverse() })),
        ),
      ),
      plan,
    );
  }
});
