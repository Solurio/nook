"use client";

// Putting a PDF on the table. Storage takes files of 50MB at most -- on the
// free plan that is a limit of the whole project, not something this app can
// raise -- so anything bigger goes up in parts and is put back together when
// it is opened.

export const PDF_MAX_MB = 200;
/** Each part stays comfortably under the storage limit. */
export const PART_MB = 45;

const MB = 1024 * 1024;

export type Uploaded = { src: string; parts?: string[]; bytes: number } | { error: string };

export async function uploadPdf(
  file: File,
  upload: (file: File) => Promise<string | null>,
  onProgress?: (done: number, total: number) => void,
): Promise<Uploaded> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return { error: "that is not a PDF" };
  if (file.size > PDF_MAX_MB * MB) return { error: `PDFs stop at ${PDF_MAX_MB}MB` };

  if (file.size <= PART_MB * MB) {
    onProgress?.(0, 1);
    const src = await upload(file);
    onProgress?.(1, 1);
    return src ? { src, bytes: file.size } : { error: "the upload did not go through" };
  }

  const total = Math.ceil(file.size / (PART_MB * MB));
  const base = file.name.replace(/\.pdf$/i, "");
  const parts: string[] = [];
  for (let i = 0; i < total; i += 1) {
    onProgress?.(i, total);
    const slice = file.slice(i * PART_MB * MB, Math.min(file.size, (i + 1) * PART_MB * MB));
    const part = new File([slice], `${base}.part${i + 1}of${total}.pdf`, { type: "application/pdf" });
    const url = await upload(part);
    if (!url) return { error: `part ${i + 1} of ${total} did not go up` };
    parts.push(url);
  }
  onProgress?.(total, total);
  return { src: parts[0], parts, bytes: file.size };
}
