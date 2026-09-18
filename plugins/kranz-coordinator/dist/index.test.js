import { describe, expect, it } from "vitest";
import entry, { artifactPathFor, inspectDossier, outcomePathFor } from "./index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
describe("kranz-coordinator", () => {
    it("declares the durable flow tools", () => {
        expect(getToolPluginMetadata(entry)?.tools.map((tool) => tool.name)).toEqual([
            "kranz_flow_start",
            "kranz_flow_link_task",
            "kranz_flow_checkpoint",
            "kranz_flow_tick",
            "kranz_flow_status",
        ]);
    });
    it("derives a deterministic artifact path", () => {
        expect(artifactPathFor({ position: 4, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8cad", name: "Guess Inc. (GUESS Foundation)" }))
            .toContain("3ddc9504-51fd-8122-83b4-f403ad4a8cad-guess-inc-guess-foundation.md");
    });
    it("validates the strict dossier handoff", () => {
        const dir = mkdtempSync(path.join(tmpdir(), "kranz-test-"));
        const artifact = path.join(dir, "packet.md");
        writeFileSync(artifact, `Prospect: Example Co\nPage ID: page-123\nArtifact path: ${artifact}\n## Deep Research\n### Charities\nhttps://example.com/source\n### Beverly Hills\nUnresolved\n### Race/Run\nNone\n### Cancer\nNone\n### Personnel\nNone\n### Other Background Context\nNone\n## Notion Replacement Contract\nPreserve unrelated content.\nPACKET_COMPLETE\n`);
        expect(inspectDossier(artifact, "page-123", "Example Co")).toMatchObject({ ok: true, errors: [] });
    });
    it("rejects a packet without citations or the replacement contract", () => {
        const dir = mkdtempSync(path.join(tmpdir(), "kranz-test-"));
        const artifact = path.join(dir, "packet.md");
        writeFileSync(artifact, `Prospect: Example Co\nPage ID: page-123\nArtifact path: ${artifact}\n## Deep Research\n### Charities\n### Beverly Hills\n### Race/Run\n### Cancer\n### Personnel\n### Other Background Context\nUnresolved\nPACKET_COMPLETE\n`);
        expect(inspectDossier(artifact, "page-123", "Example Co").errors).toEqual(expect.arrayContaining(["citations_missing", "replacement_contract_missing"]));
    });
    it("derives a deterministic child outcome path", () => {
        expect(outcomePathFor({ position: 4, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8cad", name: "Guess" }, 2))
            .toContain("3ddc9504-51fd-8122-83b4-f403ad4a8cad-attempt-2.json");
    });
});
