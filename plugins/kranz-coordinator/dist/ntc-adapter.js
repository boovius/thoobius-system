import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fingerprintArtifact } from "@thoobius/workflow-controller-core";
function slug(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
export function artifactPathFor(record, roots) {
    return path.join(roots.artifactRoot, `${record.pageId}-${slug(record.name)}.md`);
}
export function contextPathFor(record, roots) {
    return path.join(roots.stateRoot, "page-context", `${record.pageId}.json`);
}
export function receiptPathFor(record, roots) {
    return path.join(roots.stateRoot, "publication-receipts", `${record.pageId}.json`);
}
export function outcomePathFor(record, attempt, roots) {
    return path.join(roots.stateRoot, "research-outcomes", `${record.pageId}-attempt-${attempt}.json`);
}
export function inspectDossier(artifactPath, pageId, prospect) {
    if (!existsSync(artifactPath))
        return { ok: false, path: artifactPath, errors: ["artifact_missing"] };
    const markdown = readFileSync(artifactPath, "utf8");
    const errors = [];
    if (!markdown.includes(pageId))
        errors.push("page_id_mismatch");
    if (prospect && !markdown.toLowerCase().includes(prospect.toLowerCase()))
        errors.push("prospect_mismatch");
    if (!markdown.includes(artifactPath))
        errors.push("artifact_path_mismatch");
    if ((markdown.match(/^## Deep Research$/gm) ?? []).length !== 1)
        errors.push("deep_research_heading_count");
    const requiredHeadings = ["Charities", "Beverly Hills", "Race/Run", "Cancer", "Personnel", "Other Background Context"];
    const headingPositions = requiredHeadings.map((heading) => markdown.indexOf(`### ${heading}`));
    for (const heading of requiredHeadings) {
        if (!markdown.includes(`### ${heading}`))
            errors.push(`missing_heading:${heading}`);
    }
    if (headingPositions.every((position) => position >= 0) && headingPositions.some((position, index) => index > 0 && position <= headingPositions[index - 1])) {
        errors.push("heading_order");
    }
    const deepResearch = markdown.slice(markdown.indexOf("## Deep Research"), markdown.indexOf("## Notion Replacement Contract") >= 0 ? markdown.indexOf("## Notion Replacement Contract") : undefined);
    if (!/https?:\/\//.test(deepResearch))
        errors.push("citations_missing");
    if (!/Unresolved|No public evidence found|Contradictions|unknown/i.test(markdown))
        errors.push("unresolved_items_missing");
    if (!/^## Notion Replacement Contract$/m.test(markdown))
        errors.push("replacement_contract_missing");
    if (!/^PACKET_COMPLETE\s*$/m.test(markdown))
        errors.push("packet_incomplete");
    return {
        ok: errors.length === 0,
        path: artifactPath,
        sha256: fingerprintArtifact(markdown).hex,
        errors,
    };
}
