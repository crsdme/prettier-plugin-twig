import { doc } from "prettier";
import { format as prettierFormat } from "prettier";
import { Node } from "./melody/melody-types/index.js";
import { printElementOpeningTag } from "./print/Element.js";
import {
    EXPRESSION_NEEDED,
    SCRIPT_EMBED_INLINE_TWIG,
    STRING_NEEDS_QUOTES
} from "./util/publicSymbols.js";
import {
    buildScriptEmbedPlan,
    getScriptTypeAttribute,
    hasSrcAttribute,
    normalizeScriptEmbedNewlines,
    scriptBodyParserForType,
    scriptChildrenJsTwigEmbedFormatable
} from "./util/scriptEmbedding.js";
import { repairConcatenatedStatements } from "./util/repairScriptSource.js";

const { group, hardline, indent, join, line } = doc.builders;

function stripLeadingWhitespacePerLine(lines) {
    return lines.map(l => l.replace(/\r$/, "").replace(/^[ \t]+/, ""));
}

function rawEmbeddedScriptInnerDoc(trimmed) {
    const lines = stripLeadingWhitespacePerLine(trimmed.split("\n"));
    if (lines.length <= 1) {
        return lines[0] ?? "";
    }
    return join(hardline, lines);
}

function trimScriptEmbedBlockTextEdges(text) {
    return text.replace(/^\n+/, "").replace(/\n+$/, "");
}

/**
 * Multiline strings as a single Doc atom do not get extra levels from parent
 * {@link indent} on inner \\n — split into {@link hardline}-joined lines.
 */
function scriptEmbedTextChunkToDoc(chunk, trimBlockEdges = false) {
    let normalized = normalizeScriptEmbedNewlines(chunk);
    if (trimBlockEdges) {
        normalized = trimScriptEmbedBlockTextEdges(normalized);
    }
    if (!normalized.includes("\n")) {
        return normalized;
    }
    const lines = normalized.split("\n");
    if (trimBlockEdges) {
        while (lines.length > 0 && lines[lines.length - 1] === "") {
            lines.pop();
        }
    } else if (lines.length > 2 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    if (lines.length === 0) {
        return "";
    }
    return join(hardline, lines);
}

function skipWs(formatted, cursor) {
    let i = cursor;
    while (i < formatted.length && /[\t\n\r ]/.test(formatted[i])) {
        i++;
    }
    return i;
}

function takeJsUntilDelimiter(formatted, cursor) {
    const slice = formatted.slice(cursor);
    const re = /__TWIG_EXPR_PH_\d+__|\/\*__TWIGSCR_(?:IF|ELIF)_\d+_[BME]_\*\//;
    const m = slice.match(re);
    if (!m || m.index === undefined) {
        return { chunk: formatted.slice(cursor), cursor: formatted.length };
    }
    const end = cursor + m.index;
    return { chunk: formatted.slice(cursor, end), cursor: end };
}

function consumeMarker(formatted, ctx, kind, id, letter) {
    ctx.cursor = skipWs(formatted, ctx.cursor);
    const expected = `/*__TWIGSCR_${kind}_${id}_${letter}_*/`;
    if (!formatted.startsWith(expected, ctx.cursor)) {
        throw new Error(
            `Expected script embed marker ${expected} at offset ${ctx.cursor}, saw ${JSON.stringify(formatted.slice(ctx.cursor, ctx.cursor + 60))}`
        );
    }
    ctx.cursor += expected.length;
}

function filterEmbedDocs(docs) {
    return docs.filter(d => d !== "");
}

function indentScriptEmbedChunks(docs) {
    const flat = filterEmbedDocs(docs);
    if (!flat.length) {
        return "";
    }
    return indent(group([hardline, ...flat]));
}

function printIfClauseDoc(node, path, print, pathSegments, isElseIf) {
    return group([
        node.trimLeft ? "{%- " : "{% ",
        isElseIf ? "elseif" : "if",
        indent([line, path.call(print, ...pathSegments, "test")]),
        " ",
        node.trimRightIf ? "-%}" : "%}"
    ]);
}

function printElseTag(node) {
    return [
        hardline,
        node.trimLeftElse ? "{%-" : "{%",
        " else ",
        node.trimRightElse ? "-%}" : "%}"
    ];
}

function scriptEmbedEndifTagParts(node) {
    return [
        node.trimLeftEndif ? "{%-" : "{%",
        " endif ",
        node.trimRight ? "-%}" : "%}"
    ];
}

function scriptEmbedIndentUnit(options) {
    return options.useTabs === true
        ? "\t"
        : " ".repeat(Number(options.tabWidth) || 2);
}

/**
 * After `indent(group([hardline, …]))` avoid a second {@link hardline} (extra blank).
 * Literal indent before the tag matches `{% if %}`; the parser re-attaches that gap
 * to the branch’s last text node, so {@link buildScriptEmbedPlan} strips it (before
 * `{% if %}` and at each branch end before `{% endif %}`) so repeated format stays stable.
 */
function printEndifTagScriptEmbed(node, options) {
    return [
        line,
        scriptEmbedIndentUnit(options),
        ...scriptEmbedEndifTagParts(node)
    ];
}

function buildElseIfChainAssembly(chain, path, print) {
    const n = chain.node;
    const parts = [
        printIfClauseDoc(n, path, print, chain.pathSegments, true),
        indentScriptEmbedChunks(chain.consequentDocs)
    ];
    if (chain.alternate?.kind === "elseif") {
        parts.push(hardline);
        parts.push(
            buildElseIfChainAssembly(chain.alternate.chain, path, print)
        );
    } else if (chain.alternate?.kind === "else") {
        parts.push(printElseTag(n));
        parts.push(indentScriptEmbedChunks(chain.alternate.docs));
    }
    return group(parts);
}

/**
 * @returns {import("prettier").Doc[]}
 */
function buildEmbeddedIfDoc(
    manifestIfItem,
    consequentDocs,
    altAss,
    path,
    print,
    options
) {
    const n = manifestIfItem.node;
    /** @type {import("prettier").Doc[]} */
    const parts = [
        printIfClauseDoc(n, path, print, manifestIfItem.pathSegments, false),
        indentScriptEmbedChunks(consequentDocs)
    ];
    if (altAss?.kind === "else") {
        parts.push(...printElseTag(n));
        parts.push(indentScriptEmbedChunks(altAss.docs));
    } else if (altAss?.kind === "elseif") {
        parts.push(hardline);
        parts.push(buildElseIfChainAssembly(altAss.chain, path, print));
    }
    parts.push(...printEndifTagScriptEmbed(n, options));
    return parts;
}

function consumeElseIfChain(formatted, chain, ctx) {
    consumeMarker(formatted, ctx, "ELIF", chain.markerId, "B");
    const consDocs = consumeManifestItems(
        formatted,
        chain.consequent,
        ctx,
        true
    );
    /** @type {{ kind: string, docs?: import("prettier").Doc[], chain?: unknown } | null} */
    let alt = null;
    if (chain.alternateKind === "else") {
        consumeMarker(formatted, ctx, "ELIF", chain.markerId, "M");
        alt = {
            kind: "else",
            docs: consumeManifestItems(formatted, chain.alternate, ctx, true)
        };
    } else if (chain.alternateKind === "elseif") {
        consumeMarker(formatted, ctx, "ELIF", chain.markerId, "M");
        alt = {
            kind: "elseif",
            chain: consumeElseIfChain(formatted, chain.alternate, ctx)
        };
    }
    consumeMarker(formatted, ctx, "ELIF", chain.markerId, "E");
    return {
        node: chain.node,
        pathSegments: chain.pathSegments,
        consequentDocs: consDocs,
        alternate: alt
    };
}

function consumeManifestItems(formatted, manifest, ctx, trimBlockTextEdges) {
    /** @type {import("prettier").Doc[]} */
    const docs = [];
    for (const item of manifest) {
        if (item.type === "text") {
            const { chunk, cursor } = takeJsUntilDelimiter(
                formatted,
                ctx.cursor
            );
            ctx.cursor = cursor;
            const d = scriptEmbedTextChunkToDoc(chunk, trimBlockTextEdges);
            if (d !== "") {
                docs.push(d);
            }
        } else if (item.type === "expr") {
            const expected = `__TWIG_EXPR_PH_${ctx.exprIdx}__`;
            ctx.cursor = skipWs(formatted, ctx.cursor);
            if (!formatted.startsWith(expected, ctx.cursor)) {
                throw new Error(
                    `Expected Twig expr placeholder ${expected} at offset ${ctx.cursor}`
                );
            }
            docs.push(ctx.path.call(ctx.print, ...item.pathSegments));
            ctx.cursor += expected.length;
            ctx.exprIdx++;
        } else if (item.type === "if") {
            consumeMarker(formatted, ctx, "IF", item.markerId, "B");
            const consDocs = consumeManifestItems(
                formatted,
                item.consequent,
                ctx,
                true
            );
            /** @type {{ kind: string, docs?: import("prettier").Doc[], chain?: unknown } | null} */
            let altAss = null;
            if (item.alternateKind === "else") {
                consumeMarker(formatted, ctx, "IF", item.markerId, "M");
                altAss = {
                    kind: "else",
                    docs: consumeManifestItems(
                        formatted,
                        item.alternate,
                        ctx,
                        true
                    )
                };
            } else if (item.alternateKind === "elseif") {
                consumeMarker(formatted, ctx, "IF", item.markerId, "M");
                altAss = {
                    kind: "elseif",
                    chain: consumeElseIfChain(formatted, item.alternate, ctx)
                };
            }
            consumeMarker(formatted, ctx, "IF", item.markerId, "E");
            docs.push(
                ...buildEmbeddedIfDoc(
                    item,
                    consDocs,
                    altAss,
                    ctx.path,
                    ctx.print,
                    ctx.options
                )
            );
        }
    }
    return docs;
}

function withScriptEmbedInlineTwigFlag(scriptNode, fn) {
    scriptNode[SCRIPT_EMBED_INLINE_TWIG] = true;
    try {
        return fn();
    } finally {
        delete scriptNode[SCRIPT_EMBED_INLINE_TWIG];
    }
}

function manifestFormattedToDoc(
    formatted,
    manifest,
    path,
    print,
    scriptNode,
    options
) {
    const normalized = normalizeScriptEmbedNewlines(formatted);
    const ctx = {
        formatted: normalized,
        cursor: 0,
        exprIdx: 0,
        path,
        print,
        options
    };
    return withScriptEmbedInlineTwigFlag(scriptNode, () => {
        const docs = consumeManifestItems(normalized, manifest, ctx, false);
        ctx.cursor = skipWs(normalized, ctx.cursor);
        if (ctx.cursor < normalized.length) {
            const tail = normalized.slice(ctx.cursor).replace(/\n+$/, "");
            if (tail.trim()) {
                docs.push(scriptEmbedTextChunkToDoc(tail, false));
            }
        }
        const flat = filterEmbedDocs(docs);
        if (!flat.length) {
            return "";
        }
        if (flat.length === 1) {
            return flat[0];
        }
        return flat;
    });
}

function printMixedScriptChildrenDoc(path, print) {
    const printed = path.map(print, "children");
    return printed.length === 1 ? printed[0] : join(hardline, printed);
}

function babelStandaloneOptions(options) {
    /** @type {(keyof import("prettier").Options)[]} */
    const keys = [
        "tabWidth",
        "useTabs",
        "semi",
        "singleQuote",
        "bracketSpacing",
        "arrowParens",
        "trailingComma",
        "printWidth",
        "endOfLine",
        "bracketSameLine",
        "jsxSingleQuote",
        "quoteProps"
    ];
    /** @type Record<string, unknown> */
    const out = { parser: "babel" };
    for (const k of keys) {
        if (options[k] !== undefined) {
            out[k] = options[k];
        }
    }
    return out;
}

async function formatJsWithPrettier(source, options) {
    return prettierFormat(source.trimEnd(), babelStandaloneOptions(options));
}

function placeholdersStillPresent(formatted, count) {
    for (let i = 0; i < count; i++) {
        if (!formatted.includes(`__TWIG_EXPR_PH_${i}__`)) {
            return false;
        }
    }
    return true;
}

async function textToDocAsync(textToDoc, code, parser, options) {
    return Promise.resolve(
        textToDoc(code, {
            ...options,
            parser
        })
    );
}

/**
 * @type {import("prettier").Printer["embed"]}
 */
export function embed(path, options) {
    if (options.embeddedLanguageFormatting === "off") {
        return;
    }

    const node = path.getValue();
    if (!node || !Node.isElement(node)) {
        return;
    }
    if (node.name.toLowerCase() !== "script") {
        return;
    }
    if (node.selfClosing) {
        return;
    }

    const typeAttr = getScriptTypeAttribute(node);
    if (typeAttr === null) {
        return;
    }

    const parser = scriptBodyParserForType(typeAttr);
    if (!parser) {
        return;
    }

    if (hasSrcAttribute(node)) {
        return;
    }

    const children = node.children;
    if (!scriptChildrenJsTwigEmbedFormatable(children)) {
        return;
    }

    const built = buildScriptEmbedPlan(children);
    const trimmed = built.synthetic.trim();
    const twigExprCount = built.exprPaths.length;
    const isTwigMixed = twigExprCount > 0;

    if (isTwigMixed && parser !== "babel") {
        return;
    }

    return async (textToDoc, print) => {
        node[EXPRESSION_NEEDED] = true;
        const openingGroup = group(
            printElementOpeningTag(node, path, print, options)
        );
        node[EXPRESSION_NEEDED] = false;
        node[STRING_NEEDS_QUOTES] = false;

        const closingTag = ["</", node.name, ">"];

        const wrapInner = innerDoc => {
            const seq = Array.isArray(innerDoc) ? innerDoc : [innerDoc];
            const nonempty = seq.filter(d => d !== "");
            const bodyDoc =
                nonempty.length === 0
                    ? ""
                    : nonempty.length === 1
                      ? nonempty[0]
                      : group(nonempty);
            return group([
                openingGroup,
                indent([hardline, bodyDoc]),
                hardline,
                closingTag
            ]);
        };

        if (trimmed === "") {
            return group([openingGroup, closingTag]);
        }

        const innerFromTwigMixed = async source => {
            const formatted = await formatJsWithPrettier(source, options);
            if (!placeholdersStillPresent(formatted, twigExprCount)) {
                throw new Error(
                    "Twig placeholder lost while formatting script"
                );
            }
            return manifestFormattedToDoc(
                formatted,
                built.manifest,
                path,
                print,
                node,
                options
            );
        };

        const innerDocFromSource = async source => {
            if (isTwigMixed) {
                return innerFromTwigMixed(source);
            }
            return textToDocAsync(textToDoc, source, parser, options);
        };

        try {
            return wrapInner(await innerDocFromSource(trimmed));
        } catch {
            if (parser !== "babel") {
                return;
            }
            let bodySource = trimmed;
            const repaired = repairConcatenatedStatements(trimmed);
            if (repaired !== trimmed) {
                try {
                    return wrapInner(await innerDocFromSource(repaired));
                } catch {
                    bodySource = repaired;
                }
            }
            if (isTwigMixed) {
                return wrapInner(printMixedScriptChildrenDoc(path, print));
            }
            return wrapInner(rawEmbeddedScriptInnerDoc(bodySource));
        }
    };
}
