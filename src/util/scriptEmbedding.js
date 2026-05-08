import { Node } from "../melody/melody-types/index.js";

export function normalizeScriptMimeType(typeAttrValue) {
    if (!typeAttrValue) {
        return "";
    }
    return typeAttrValue.trim().split(";")[0].trim().toLowerCase();
}

/**
 * Static `type="..."` only; dynamic Twig values skip embedding.
 * @returns {string|null} normalized MIME / token, or null when not a plain string literal
 */
export function getScriptTypeAttribute(element) {
    const attr = element.attributes?.find(
        a => a.name?.name?.toLowerCase() === "type"
    );
    if (!attr?.value) {
        return "";
    }
    if (!Node.isStringLiteral(attr.value)) {
        return null;
    }
    return normalizeScriptMimeType(attr.value.value);
}

export function hasSrcAttribute(element) {
    return element.attributes?.some(
        a => a.name?.name?.toLowerCase() === "src" && a.value
    );
}

/** @returns {"babel"|"json"|null} */
export function scriptBodyParserForType(normalizedType) {
    if (
        normalizedType === "application/json" ||
        normalizedType === "application/ld+json" ||
        normalizedType === "importmap"
    ) {
        return "json";
    }

    const jsTypes = new Set([
        "",
        "javascript",
        "text/javascript",
        "application/javascript",
        "module",
        "text/babel"
    ]);
    if (jsTypes.has(normalizedType)) {
        return "babel";
    }

    const nonJsTypes = new Set([
        "text/template",
        "text/html",
        "text/ng-template"
    ]);
    if (nonJsTypes.has(normalizedType)) {
        return null;
    }

    return null;
}

export function scriptChildrenArePlainText(children) {
    if (!children?.length) {
        return true;
    }
    return children.every(child => Node.isPrintTextStatement(child));
}

/** Plain text and Twig `{{ }}` only inside `<script>` (no nested HTML). */
export function scriptChildrenEmbeddable(children) {
    if (!children?.length) {
        return true;
    }
    return children.every(
        child =>
            Node.isPrintTextStatement(child) ||
            Node.isPrintExpressionStatement(child)
    );
}

/**
 * Build synthetic JS for Babel: each Twig print becomes `__TWIG_EXPR_PH_n__`.
 * @returns {{ synthetic: string, exprChildIndices: number[] }}
 */
export function buildScriptSyntheticJs(children) {
    if (!children?.length) {
        return { synthetic: "", exprChildIndices: [] };
    }
    let synthetic = "";
    const exprChildIndices = [];
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (Node.isPrintTextStatement(child)) {
            synthetic += child.value.value;
        } else if (Node.isPrintExpressionStatement(child)) {
            synthetic += `__TWIG_EXPR_PH_${exprChildIndices.length}__`;
            exprChildIndices.push(i);
        }
    }
    return { synthetic, exprChildIndices };
}

export function getPlainScriptSource(children) {
    if (!children?.length) {
        return "";
    }
    return children.map(c => c.value.value).join("");
}

/** @param {unknown[]|unknown|null|undefined} nodes */
function asStatementArray(nodes) {
    if (nodes == null) {
        return [];
    }
    return Array.isArray(nodes) ? nodes : [nodes];
}

function scriptMixedStatementListOk(nodes) {
    const list = asStatementArray(nodes);
    if (!list.length) {
        return true;
    }
    return list.every(scriptMixedEmbedChildOk);
}

function scriptMixedEmbedChildOk(child) {
    if (
        Node.isPrintTextStatement(child) ||
        Node.isPrintExpressionStatement(child)
    ) {
        return true;
    }
    if (Node.isIfStatement(child)) {
        if (!scriptMixedStatementListOk(child.consequent)) {
            return false;
        }
        if (!child.alternate) {
            return true;
        }
        if (Node.isIfStatement(child.alternate)) {
            return scriptMixedEmbedChildOk(child.alternate);
        }
        if (Array.isArray(child.alternate)) {
            return scriptMixedStatementListOk(child.alternate);
        }
        return false;
    }
    return false;
}

/**
 * Like {@link scriptChildrenEmbeddable} but allows Twig `{% if %}` / `{% elseif %}`
 * / `{% else %}` around JS text so the embedded JS formatter can still run.
 */
export function scriptChildrenJsTwigEmbedFormatable(children) {
    if (!children?.length) {
        return true;
    }
    return scriptMixedStatementListOk(children);
}

/** @param {string} text */
export function normalizeScriptEmbedNewlines(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function mergeOrPushText(manifest, value) {
    const normalized = normalizeScriptEmbedNewlines(value);
    if (normalized === "") {
        return;
    }
    const last = manifest[manifest.length - 1];
    if (last?.type === "text") {
        last.value += normalized;
    } else {
        manifest.push({ type: "text", value: normalized });
    }
}

function walkElseIfChainManifest(elseifNode, pathSegments) {
    const chain = {
        type: "elseif",
        node: elseifNode,
        pathSegments,
        markerId: -1,
        consequent: [],
        alternateKind: null,
        alternate: null
    };
    walkNodesToManifest(
        asStatementArray(elseifNode.consequent),
        [...pathSegments, "consequent"],
        chain.consequent
    );
    if (elseifNode.alternate) {
        if (Node.isIfStatement(elseifNode.alternate)) {
            chain.alternateKind = "elseif";
            chain.alternate = walkElseIfChainManifest(elseifNode.alternate, [
                ...pathSegments,
                "alternate"
            ]);
        } else if (
            Array.isArray(elseifNode.alternate) &&
            elseifNode.alternate.length
        ) {
            chain.alternateKind = "else";
            chain.alternate = [];
            walkNodesToManifest(
                elseifNode.alternate,
                [...pathSegments, "alternate"],
                chain.alternate
            );
        }
    }
    return chain;
}

function walkIfStatementToManifestItem(node, pathSegments) {
    const item = {
        type: "if",
        node,
        pathSegments,
        markerId: -1,
        consequent: [],
        alternateKind: null,
        alternate: null
    };
    walkNodesToManifest(
        asStatementArray(node.consequent),
        [...pathSegments, "consequent"],
        item.consequent
    );
    if (node.alternate) {
        if (Node.isIfStatement(node.alternate)) {
            item.alternateKind = "elseif";
            item.alternate = walkElseIfChainManifest(node.alternate, [
                ...pathSegments,
                "alternate"
            ]);
        } else if (Array.isArray(node.alternate) && node.alternate.length) {
            item.alternateKind = "else";
            item.alternate = [];
            walkNodesToManifest(
                node.alternate,
                [...pathSegments, "alternate"],
                item.alternate
            );
        }
    }
    return item;
}

/**
 * @param {unknown[]} nodes
 * @param {(string|number)[]} pathToIndexedParent segments before child index (e.g. `["children"]`)
 * @param {unknown[]} manifest
 */
function walkNodesToManifest(nodes, pathToIndexedParent, manifest) {
    if (!nodes?.length) {
        return;
    }
    for (let i = 0; i < nodes.length; i++) {
        const stmt = nodes[i];
        const nodePathSegments = [...pathToIndexedParent, i];
        if (Node.isPrintTextStatement(stmt)) {
            mergeOrPushText(manifest, stmt.value.value);
        } else if (Node.isPrintExpressionStatement(stmt)) {
            manifest.push({ type: "expr", pathSegments: nodePathSegments });
        } else if (Node.isIfStatement(stmt)) {
            manifest.push(
                walkIfStatementToManifestItem(stmt, nodePathSegments)
            );
        }
    }
}

function serializeElseIfChain(chain, ctx) {
    const id = ctx.ifId++;
    chain.markerId = id;
    ctx.synthetic += `/*__TWIGSCR_ELIF_${id}_B_*/`;
    serializeManifestItems(chain.consequent, ctx);
    if (chain.alternateKind === "else" && chain.alternate?.length) {
        ctx.synthetic += `/*__TWIGSCR_ELIF_${id}_M_*/`;
        serializeManifestItems(chain.alternate, ctx);
    } else if (chain.alternateKind === "elseif" && chain.alternate) {
        ctx.synthetic += `/*__TWIGSCR_ELIF_${id}_M_*/`;
        serializeElseIfChain(chain.alternate, ctx);
    }
    ctx.synthetic += `/*__TWIGSCR_ELIF_${id}_E_*/`;
}

function serializeIfManifestItem(item, ctx) {
    const id = ctx.ifId++;
    item.markerId = id;
    ctx.synthetic += `/*__TWIGSCR_IF_${id}_B_*/`;
    serializeManifestItems(item.consequent, ctx);
    if (item.alternateKind === "else" && item.alternate?.length) {
        ctx.synthetic += `/*__TWIGSCR_IF_${id}_M_*/`;
        serializeManifestItems(item.alternate, ctx);
    } else if (item.alternateKind === "elseif" && item.alternate) {
        ctx.synthetic += `/*__TWIGSCR_IF_${id}_M_*/`;
        serializeElseIfChain(item.alternate, ctx);
    }
    ctx.synthetic += `/*__TWIGSCR_IF_${id}_E_*/`;
}

function serializeManifestItems(items, ctx) {
    for (const item of items) {
        if (item.type === "text") {
            ctx.synthetic += item.value;
        } else if (item.type === "expr") {
            ctx.synthetic += `__TWIG_EXPR_PH_${ctx.phIndex}__`;
            ctx.exprPaths.push(item.pathSegments);
            ctx.phIndex++;
        } else if (item.type === "if") {
            serializeIfManifestItem(item, ctx);
        }
    }
}

/**
 * Literal indent we print before `{% endif %}` can end up in the preceding
 * {@link PrintTextStatement}; strip trailing tabs/spaces after the last newline so
 * repeated format does not stack indentation.
 */
function trimManifestTextBeforeIfBlocks(manifest) {
    for (let i = 1; i < manifest.length; i++) {
        const cur = manifest[i];
        if (cur.type !== "if") {
            continue;
        }
        const prev = manifest[i - 1];
        if (prev.type !== "text" || typeof prev.value !== "string") {
            continue;
        }
        prev.value = prev.value
            .replace(/\n[\t ]+$/u, "\n")
            .replace(/[\t ]+$/u, "");
    }
}

/**
 * Parser attaches the whole gap (newlines + indent) before `{% endif %}` to the
 * preceding text node. The script-embed printer then emits a line break plus
 * indent again, so we drop **all** trailing whitespace on that text; the
 * printer recreates the newline + alignment before the tag.
 */
function stripBranchEndTextBeforeIfClose(value) {
    return value.replace(/\s+$/u, "");
}

/**
 * Same issue as {@link trimManifestTextBeforeIfBlocks}, but for the branch that
 * ends immediately before `{% endif %}` (parser attaches the indent to the last
 * text node in that branch).
 */
function trimTrailingWsAtScriptBranchEndBeforeIfClose(items) {
    if (!items?.length) {
        return;
    }
    for (let i = items.length - 1; i >= 0; i--) {
        const n = items[i];
        if (n.type === "text" && typeof n.value === "string") {
            n.value = stripBranchEndTextBeforeIfClose(n.value);
            return;
        }
        if (n.type === "if") {
            trimTrailingWsBeforeIfManifestClose(n);
            return;
        }
    }
}

function trimTrailingWsBeforeElseIfChainClose(chain) {
    if (chain.alternateKind === "elseif" && chain.alternate) {
        trimTrailingWsBeforeElseIfChainClose(chain.alternate);
    } else if (chain.alternateKind === "else" && chain.alternate?.length) {
        trimTrailingWsAtScriptBranchEndBeforeIfClose(chain.alternate);
    } else {
        trimTrailingWsAtScriptBranchEndBeforeIfClose(chain.consequent);
    }
}

function trimTrailingWsBeforeIfManifestClose(ifItem) {
    if (ifItem.alternateKind === "elseif" && ifItem.alternate) {
        trimTrailingWsBeforeElseIfChainClose(ifItem.alternate);
    } else if (ifItem.alternateKind === "else" && ifItem.alternate?.length) {
        trimTrailingWsAtScriptBranchEndBeforeIfClose(ifItem.alternate);
    } else {
        trimTrailingWsAtScriptBranchEndBeforeIfClose(ifItem.consequent);
    }
}

function trimElseIfChainManifestTrailingBeforeClose(chain) {
    trimManifestTextTrailingBeforeIfCloses(chain.consequent);
    if (chain.alternateKind === "else" && chain.alternate?.length) {
        trimManifestTextTrailingBeforeIfCloses(chain.alternate);
    } else if (chain.alternateKind === "elseif" && chain.alternate) {
        trimElseIfChainManifestTrailingBeforeClose(chain.alternate);
    }
    trimTrailingWsBeforeElseIfChainClose(chain);
}

function trimManifestTextTrailingBeforeIfCloses(manifest) {
    for (const item of manifest) {
        if (item.type !== "if") {
            continue;
        }
        trimManifestTextTrailingBeforeIfCloses(item.consequent);
        if (item.alternateKind === "else" && item.alternate?.length) {
            trimManifestTextTrailingBeforeIfCloses(item.alternate);
        } else if (item.alternateKind === "elseif" && item.alternate) {
            trimElseIfChainManifestTrailingBeforeClose(item.alternate);
        }
        trimTrailingWsBeforeIfManifestClose(item);
    }
}

/**
 * Manifest + synthetic JS for embedding (Twig `{{ }}`, optional `{% if %}` inside `<script>`).
 * @returns {{ synthetic: string, exprPaths: (string|number)[][], manifest: unknown[] }}
 */
export function buildScriptEmbedPlan(scriptChildren) {
    const manifest = [];
    walkNodesToManifest(scriptChildren, ["children"], manifest);
    trimManifestTextBeforeIfBlocks(manifest);
    trimManifestTextTrailingBeforeIfCloses(manifest);
    const ctx = {
        synthetic: "",
        phIndex: 0,
        exprPaths: [],
        ifId: 0
    };
    serializeManifestItems(manifest, ctx);
    return {
        synthetic: ctx.synthetic,
        exprPaths: ctx.exprPaths,
        manifest
    };
}
