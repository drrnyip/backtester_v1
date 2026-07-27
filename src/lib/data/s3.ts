import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

const ENDPOINT = process.env.MASSIVE_S3_ENDPOINT || "https://files.massive.com";
const BUCKET = process.env.MASSIVE_S3_BUCKET || "flatfiles";

export function getS3Client(): S3Client {
  const accessKeyId = process.env.MASSIVE_S3_ACCESS_KEY;
  const secretAccessKey = process.env.MASSIVE_S3_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "MASSIVE_S3_ACCESS_KEY and MASSIVE_S3_SECRET_KEY are required. Get them from the Massive dashboard (Flat Files / S3).",
    );
  }
  return new S3Client({
    endpoint: ENDPOINT,
    region: "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

/** Candidate object keys for a CME day file (Massive path conventions vary slightly). */
export function candidateKeys(kind: "trades" | "quotes", date: string): string[] {
  const y = date.slice(0, 4);
  const m = date.slice(5, 7);
  const prefix = `futures/${kind}/cme`;
  return [
    `${prefix}/${date}.csv.gz`,
    `${prefix}/${y}/${m}/${date}.csv.gz`,
    `${prefix}/${y}/${date}.csv.gz`,
  ];
}

export async function resolveObjectKey(
  client: S3Client,
  kind: "trades" | "quotes",
  date: string,
): Promise<string> {
  for (const key of candidateKeys(kind, date)) {
    try {
      await client.send(
        new ListObjectsV2Command({ Bucket: BUCKET, Prefix: key, MaxKeys: 1 }),
      );
      // List succeeds even if empty — probe with GetObject Range or Head via Get.
      // Try a lightweight list exact match:
      const listed = await client.send(
        new ListObjectsV2Command({ Bucket: BUCKET, Prefix: key, MaxKeys: 5 }),
      );
      const hit = listed.Contents?.find((o) => o.Key === key);
      if (hit?.Key) return hit.Key;
    } catch {
      // try next
    }
  }
  // Final attempt: list the date prefix directory.
  const y = date.slice(0, 4);
  const m = date.slice(5, 7);
  for (const prefix of [
    `futures/${kind}/cme/${date}`,
    `futures/${kind}/cme/${y}/${m}/`,
    `futures/${kind}/cme/${y}/`,
  ]) {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: 100 }),
    );
    const hit = listed.Contents?.find((o) => o.Key?.includes(date) && o.Key.endsWith(".csv.gz"));
    if (hit?.Key) return hit.Key;
  }
  throw new Error(
    `No Massive flat file found for ${kind} on ${date}. Confirm Futures Developer+ plan and S3 access.`,
  );
}

export async function getObjectStream(client: S3Client, key: string): Promise<Readable> {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!res.Body) throw new Error(`Empty body for s3://${BUCKET}/${key}`);
    return res.Body as Readable;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("AccessDenied") || msg.includes("Forbidden")) {
      throw new Error(
        `Massive S3 access denied for ${key}. Flat files require Futures Developer+ and valid S3 credentials.`,
      );
    }
    if (msg.includes("NoSuchKey") || msg.includes("404") || msg.includes("NotFound")) {
      throw new Error(`Massive flat file not found: ${key}`);
    }
    throw err;
  }
}
