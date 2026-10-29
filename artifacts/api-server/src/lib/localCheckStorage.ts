import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const storageRoot = path.resolve(
  process.env.CHECK_IMAGE_DIR ?? path.join(tmpdir(), "wllfwr-check-images"),
);

export function usesLocalCheckStorage(): boolean {
  return process.env.CHECK_IMAGE_STORAGE_DRIVER === "local";
}

export function createLocalCheckObjectPath(): string {
  return `/objects/${randomUUID()}`;
}

function diskPath(objectPath: string): string {
  const match = /^\/objects\/([0-9a-f-]{36})$/i.exec(objectPath);
  if (!match) throw new Error("Invalid private check image path.");
  return path.join(storageRoot, match[1]);
}

export function matchesCheckImageSignature(
  contentType: string,
  data: Buffer,
): boolean {
  if (contentType === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      data.length >= 8 &&
      data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (contentType === "image/webp") {
    return (
      data.length >= 12 &&
      data.toString("ascii", 0, 4) === "RIFF" &&
      data.toString("ascii", 8, 12) === "WEBP"
    );
  }
  return false;
}

export async function writeLocalCheckImage(
  objectPath: string,
  data: Buffer,
): Promise<void> {
  const destination = diskPath(objectPath);
  await mkdir(storageRoot, { recursive: true, mode: 0o700 });
  const temporaryPath = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, data, { flag: "wx", mode: 0o600 });
    await rename(temporaryPath, destination);
  } catch (error) {
    await import("node:fs/promises").then(({ rm }) =>
      rm(temporaryPath, { force: true }).catch(() => undefined),
    );
    throw error;
  }
}

export async function readLocalCheckImage(objectPath: string): Promise<Buffer> {
  return readFile(diskPath(objectPath));
}

export async function deleteLocalCheckImage(objectPath: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(diskPath(objectPath), { force: true });
}
