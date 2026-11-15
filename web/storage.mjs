import {
  blankDocument,
  validateDocument,
  LIMITS,
  InputError,
} from "./model.mjs";
import { planProject } from "./planner.mjs";
export const STORAGE_KEY = "jalurproyek.project.v1";
export function parseBackup(text) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > LIMITS.backupBytes
  )
    throw new InputError("Backup maksimal 256.000 byte UTF-8.");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InputError("Teks bukan JSON yang valid.");
  }
  const document = validateDocument(value);
  planProject(document);
  return document;
}
export function serializeBackup(document) {
  const valid = validateDocument(document);
  planProject(valid);
  const result = JSON.stringify(valid, null, 2) + "\n";
  if (new TextEncoder().encode(result).length > LIMITS.backupBytes)
    throw new InputError("Dokumen melebihi kapasitas backup.");
  return result;
}
/** Keadaan aktif baru diterbitkan setelah validasi, perencanaan, dan tulis berhasil. */
export class ProjectSession {
  constructor(storage, key = STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
    this.document = null;
    this.plan = null;
    this.raw = undefined;
  }
  readRaw() {
    try {
      return this.storage.getItem(this.key);
    } catch {
      throw new InputError(
        "Penyimpanan browser tidak bisa dibaca. Periksa izin penyimpanan.",
      );
    }
  }
  load() {
    const raw = this.readRaw(),
      document = raw === null ? blankDocument() : parseBackup(raw),
      plan = planProject(document);
    this.raw = raw;
    this.document = document;
    this.plan = plan;
    return { document: structuredClone(document), plan: structuredClone(plan) };
  }
  commit(candidate) {
    if (this.document === null)
      throw new InputError("Data belum berhasil dimuat.");
    const document = validateDocument(candidate),
      plan = planProject(document),
      raw = serializeBackup(document);
    if (this.readRaw() !== this.raw)
      throw new InputError(
        "Data berubah di tab lain. Muat ulang sebelum menyimpan; perubahan ini belum disimpan.",
      );
    try {
      this.storage.setItem(this.key, raw);
    } catch {
      throw new InputError(
        "Gagal menyimpan. Rencana aktif tetap utuh. Unduh backup dan periksa ruang penyimpanan.",
      );
    }
    this.raw = raw;
    this.document = document;
    this.plan = plan;
    return { document: structuredClone(document), plan: structuredClone(plan) };
  }
  import(text) {
    return this.commit(parseBackup(text));
  }
  reset() {
    const document = blankDocument(),
      plan = planProject(document),
      raw = serializeBackup(document);
    try {
      this.storage.setItem(this.key, raw);
    } catch {
      throw new InputError("Reset gagal; data lama tidak dihapus.");
    }
    this.raw = raw;
    this.document = document;
    this.plan = plan;
    return { document: structuredClone(document), plan: structuredClone(plan) };
  }
}
