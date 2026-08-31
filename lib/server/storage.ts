import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let client: S3Client | undefined;
let bucketReady: Promise<void> | undefined;

function storageClient() {
  if (!env.s3Endpoint || !env.s3AccessKey || !env.s3SecretKey) throw new Error("S3 storage is not configured");
  if (!client) client = new S3Client({
    endpoint: env.s3Endpoint,
    region: env.s3Region,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
  });
  return client;
}

export async function ensureBucket() {
  if (!bucketReady) bucketReady = (async () => {
    const s3 = storageClient();
    try { await s3.send(new HeadBucketCommand({ Bucket: env.s3Bucket })); }
    catch {
      try { await s3.send(new CreateBucketCommand({ Bucket: env.s3Bucket })); }
      catch { await s3.send(new HeadBucketCommand({ Bucket: env.s3Bucket })); }
    }
  })().catch((error) => { bucketReady = undefined; throw error; });
  await bucketReady;
}

export async function putSource(key: string, body: Uint8Array, contentType: string) {
  await ensureBucket();
  await storageClient().send(new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }));
}

export async function getSource(key: string) {
  const response = await storageClient().send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }));
  if (!response.Body) throw new Error("Stored file has no body");
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function deleteSource(key: string) {
  await storageClient().send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
}

export async function sourceDownloadUrl(key: string) {
  return getSignedUrl(storageClient(), new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }), { expiresIn: 300 });
}
