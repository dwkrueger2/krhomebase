"use client";

import { useEffect, useState } from "react";
import { connectToHost } from "@krhomebase/tool-sdk/frame";

const HOST_ORIGINS = ["https://krhomebase.com", "http://localhost:3011", "http://localhost:3031"];

/** Applies the host theme and confirms the SDK frame handshake without requesting Homebase data. */
export function HostBridgeStatus() {
  const [status, setStatus] = useState("Standalone preview");

  useEffect(() => {
    if (window.self === window.top) return;
    let active = true;
    void connectToHost({ hostOrigins: HOST_ORIGINS }).then(() => {
      if (active) setStatus("Connected to KR Homebase");
    }).catch(() => {
      if (active) setStatus("Host connection unavailable");
    });
    return () => { active = false; };
  }, []);

  return <span className="text-xs text-[var(--kr-theme-muted,#a7afb8)]" aria-live="polite">{status}</span>;
}
