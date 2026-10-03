import { NextResponse } from "next/server";

import {
  emptyAppConfig,
  isLocalRequest,
  readAppConfig,
  sanitizeAppConfig,
  writeAppConfig,
} from "@/lib/config-file";

/**
 * Application configuration, persisted to `~/.openllmpix/config.json`.
 *
 * Local-only by design: the file holds plaintext API keys, so a deployed
 * instance must not hand them out. See src/lib/config-file.ts.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORBIDDEN =
  "This endpoint only serves requests from the local machine, because the " +
  "config file contains plaintext API keys.";

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }

  try {
    return NextResponse.json({ config: await readAppConfig() });
  } catch (error) {
    console.error("[config] read failed:", error);
    return NextResponse.json({ error: "Could not read the configuration file" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const payload = (body as { config?: unknown })?.config ?? body;

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  try {
    const config = sanitizeAppConfig(payload);
    await writeAppConfig(config);

    return NextResponse.json({ config });
  } catch (error) {
    console.error("[config] write failed:", error);
    return NextResponse.json({ error: "Could not write the configuration file" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }

  try {
    await writeAppConfig(emptyAppConfig());
    return NextResponse.json({ config: emptyAppConfig() });
  } catch (error) {
    console.error("[config] reset failed:", error);
    return NextResponse.json({ error: "Could not reset the configuration file" }, { status: 500 });
  }
}