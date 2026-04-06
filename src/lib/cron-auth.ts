import { timingSafeEqual } from "crypto";

export function verifyCronSecret(req: Request): boolean {
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
