import { defineTool } from "@krhomebase/tool-sdk/manifest";
import packageMetadata from "../package.json";

/** Builds registration metadata from deployment-selected addresses; no unverified public URL is hardcoded. */
export function createToolManifest(entryUrl: string, hostOrigins: string[]) {
  return defineTool({
    name: "google-chat-scraper",
    label: "Google Chat Intake",
    description: "Review candidate phone-call and email activities imported from one Google Chat space.",
    icon: "communications",
    version: packageMetadata.version,
    entryUrl,
    hostOrigins,
    scopes: [],
    roles: ["super_admin", "attorney", "paralegal", "staff"],
    serverAccess: false,
  });
}
