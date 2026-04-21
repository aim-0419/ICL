import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../shared/db/mysql.js";

// ─── 강사 ─────────────────────────────────────────────────────────────────────

export async function listInstructors() {
  const rows = await query(
    `SELECT id, name, role, intro, careers, image_path AS imagePath, sort_order AS sortOrder, created_at AS createdAt
     FROM instructors ORDER BY sort_order ASC, created_at ASC`
  );
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    ...r,
    careers: (() => { try { return JSON.parse(r.careers || "[]"); } catch { return []; } })(),
  }));
}

export async function upsertInstructor({ id, name, role, intro, careers, imagePath, sortOrder }) {
  const safeId = id || randomUUID();
  const safeCareers = JSON.stringify(Array.isArray(careers) ? careers : []);
  await query(
    `INSERT INTO instructors (id, name, role, intro, careers, image_path, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), role = VALUES(role), intro = VALUES(intro),
       careers = VALUES(careers), image_path = VALUES(image_path), sort_order = VALUES(sort_order)`,
    [safeId, String(name || ""), String(role || ""), String(intro || ""), safeCareers, imagePath || null, Number(sortOrder || 0)]
  );
  return { id: safeId };
}

export async function deleteInstructor(id) {
  await query(`DELETE FROM instructors WHERE id = ?`, [String(id)]);
}

// ─── 지점 ─────────────────────────────────────────────────────────────────────

export async function listBranches() {
  const rows = await query(
    `SELECT id, name, address, phone, parking, lat, lng,
            map_link AS mapLink, sort_order AS sortOrder, created_at AS createdAt
     FROM branches ORDER BY sort_order ASC, created_at ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function upsertBranch({ id, name, address, phone, parking, lat, lng, mapLink, sortOrder }) {
  const safeId = id || randomUUID();
  await query(
    `INSERT INTO branches (id, name, address, phone, parking, lat, lng, map_link, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), address = VALUES(address), phone = VALUES(phone),
       parking = VALUES(parking), lat = VALUES(lat), lng = VALUES(lng),
       map_link = VALUES(map_link), sort_order = VALUES(sort_order)`,
    [safeId, String(name || ""), String(address || ""), String(phone || ""),
     String(parking || ""), lat != null ? Number(lat) : null, lng != null ? Number(lng) : null,
     mapLink || null, Number(sortOrder || 0)]
  );
  return { id: safeId };
}

export async function deleteBranch(id) {
  await query(`DELETE FROM branches WHERE id = ?`, [String(id)]);
}
