import test from "node:test";
import assert from "node:assert/strict";
import { blankDocument, upsertTask, removeTask } from "../web/model.mjs";
import {
  ProjectSession,
  STORAGE_KEY,
  parseBackup,
  serializeBackup,
} from "../web/storage.mjs";
import { DEMO } from "../web/example.mjs";

class MemoryStorage {
  constructor(raw = null) {
    this.raw = raw;
    this.writes = 0;
    this.failWrite = false;
    this.failRead = false;
  }
  getItem(key) {
    assert.equal(key, STORAGE_KEY);
    if (this.failRead) throw new Error("blocked");
    return this.raw;
  }
  setItem(key, raw) {
    assert.equal(key, STORAGE_KEY);
    if (this.failWrite) throw new Error("quota");
    this.writes++;
    this.raw = raw;
  }
}
function setup() {
  const storage = new MemoryStorage(),
    session = new ProjectSession(storage);
  session.load();
  session.commit(DEMO);
  return { storage, session };
}
function snapshot(session, storage) {
  return structuredClone({
    document: session.document,
    plan: session.plan,
    raw: storage.raw,
    writes: storage.writes,
  });
}

test("integrasi: buat → hubungkan → hitung → ubah → reload → backup → impor", () => {
  const storage = new MemoryStorage(),
    session = new ProjectSession(storage);
  session.load();
  let doc = blankDocument();
  doc.title = "Proyek kelompok";
  for (const t of [
    { id: "A", name: "Riset kebutuhan", duration: 2, dependsOn: [] },
    { id: "B", name: "Buat antarmuka", duration: 3, dependsOn: ["A"] },
    { id: "C", name: "Siapkan data", duration: 4, dependsOn: ["A"] },
    { id: "D", name: "Gabungkan dan demo", duration: 2, dependsOn: ["B", "C"] },
  ])
    session.commit((doc = upsertTask(doc, t)));
  assert.equal(session.plan.duration, 8);
  session.commit(
    upsertTask(session.document, {
      ...session.document.tasks.find((t) => t.id === "C"),
      duration: 1,
    }),
  );
  assert.equal(session.plan.duration, 7);
  const reloaded = new ProjectSession(storage);
  reloaded.load();
  assert.deepEqual(reloaded.document, session.document);
  assert.deepEqual(reloaded.plan, session.plan);
  const backup = serializeBackup(reloaded.document),
    other = new ProjectSession(new MemoryStorage());
  other.load();
  other.import(backup);
  assert.deepEqual(other.document, session.document);
  assert.deepEqual(other.plan, session.plan);
});
test("integrasi gagal: siklus ditolak sebelum menulis, dokumen dan hasil sebelumnya tetap utuh", () => {
  const { session, storage } = setup(),
    before = snapshot(session, storage),
    candidate = upsertTask(session.document, {
      ...session.document.tasks.find((t) => t.id === "A"),
      dependsOn: ["G"],
    });
  assert.throws(() => session.commit(candidate), /Siklus ketergantungan/);
  assert.deepEqual(snapshot(session, storage), before);
  assert.equal(new ProjectSession(storage).load().plan.duration, 16);
});
test("integrasi gagal: kuota simpan habis tidak menerbitkan state baru; retry berhasil", () => {
  const { session, storage } = setup(),
    before = snapshot(session, storage),
    candidate = { ...session.document, title: "Belum tersimpan" };
  storage.failWrite = true;
  assert.throws(() => session.commit(candidate), /Gagal menyimpan/);
  assert.deepEqual(snapshot(session, storage), before);
  storage.failWrite = false;
  session.commit(candidate);
  assert.equal(
    new ProjectSession(storage).load().document.title,
    "Belum tersimpan",
  );
});
test("backup JSON rusak, versi asing, prasyarat hilang dan siklus tidak menimpa data aktif", () => {
  const { session, storage } = setup(),
    before = snapshot(session, storage),
    cyclic = structuredClone(DEMO);
  cyclic.tasks.find((t) => t.id === "A").dependsOn = ["G"];
  for (const invalid of [
    "{bad",
    JSON.stringify({ ...DEMO, schemaVersion: 8 }),
    JSON.stringify({
      ...DEMO,
      tasks: [{ id: "X", name: "X", duration: 1, dependsOn: ["MISSING"] }],
    }),
    JSON.stringify(cyclic),
  ]) {
    assert.throws(() => session.import(invalid));
    assert.deepEqual(snapshot(session, storage), before);
  }
});
test("batas backup dihitung dalam byte UTF-8, bukan jumlah karakter", () => {
  assert.throws(() => parseBackup(" ".repeat(256001)), /256.000 byte/);
  assert.throws(() => parseBackup("📊".repeat(64001)), /256.000 byte/);
  assert.equal(parseBackup(serializeBackup(DEMO)).tasks.length, 7);
});
test("tab yang tertinggal menolak penimpaan ketika data dasar sudah berubah", () => {
  const { session, storage } = setup(),
    other = new ProjectSession(storage);
  other.load();
  other.commit({ ...other.document, title: "Perubahan tab kedua" });
  const stale = structuredClone({
    document: session.document,
    plan: session.plan,
  });
  assert.throws(
    () => session.commit({ ...session.document, title: "Usang" }),
    /tab lain/,
  );
  assert.deepEqual({ document: session.document, plan: session.plan }, stale);
  assert.equal(JSON.parse(storage.raw).title, "Perubahan tab kedua");
  session.load();
  session.commit({ ...session.document, title: "Setelah muat ulang" });
  assert.equal(JSON.parse(storage.raw).title, "Setelah muat ulang");
});
test("data tersimpan rusak tidak dihapus otomatis; reset eksplisit baru menggantinya", () => {
  const storage = new MemoryStorage("backup-rusak"),
    session = new ProjectSession(storage);
  assert.throws(() => session.load(), /JSON/);
  assert.equal(storage.raw, "backup-rusak");
  assert.equal(storage.writes, 0);
  assert.equal(session.document, null);
  assert.throws(() => session.commit(DEMO), /belum berhasil/);
  session.reset();
  assert.deepEqual(
    new ProjectSession(storage).load().document,
    blankDocument(),
  );
});
test("gagal baca setelah rencana aktif tidak menghapus keadaan yang telah dimuat", () => {
  const { session, storage } = setup(),
    before = snapshot(session, storage);
  storage.failRead = true;
  assert.throws(() => session.load(), /tidak bisa dibaca/);
  assert.deepEqual(snapshot(session, storage), before);
  assert.throws(
    () => session.commit({ ...session.document, title: "Tidak boleh" }),
    /tidak bisa dibaca/,
  );
  assert.deepEqual(snapshot(session, storage), before);
});
test("gagal reset mempertahankan data mentah serta rencana sebelumnya", () => {
  const { session, storage } = setup(),
    before = snapshot(session, storage);
  storage.failWrite = true;
  assert.throws(() => session.reset(), /Reset gagal/);
  assert.deepEqual(snapshot(session, storage), before);
});
test("hasil pemanggilan dan kandidat input tidak dapat memutasi sesi yang tersimpan", () => {
  const { session, storage } = setup(),
    result = session.load(),
    before = snapshot(session, storage);
  result.document.title = "Di luar";
  result.plan.rows[0].duration = 999;
  assert.deepEqual(snapshot(session, storage), before);
  const candidate = structuredClone(DEMO);
  session.commit(candidate);
  candidate.tasks[0].name = "Mutasi di luar";
  assert.equal(session.document.tasks[0].name, "Susun kebutuhan");
});
test("hapus tugas daun → persist → reload konsisten tanpa mengubah file backup sebelumnya", () => {
  const { session, storage } = setup(),
    oldBackup = serializeBackup(session.document);
  session.commit(removeTask(session.document, "G"));
  const loaded = new ProjectSession(storage).load();
  assert.equal(loaded.plan.taskCount, 6);
  assert.equal(loaded.plan.duration, 15);
  assert.equal(parseBackup(oldBackup).tasks.length, 7);
});
