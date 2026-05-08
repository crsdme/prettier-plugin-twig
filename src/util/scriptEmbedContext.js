import { someParentNode } from "./publicFunctions.js";
import { SCRIPT_EMBED_INLINE_TWIG } from "./publicSymbols.js";

/**
 * True when this path prints Twig that sits inside a `<script>` body rebuilt from
 * the JS embed placeholder flow (compact `{{ … }}` / pipes without extra breaks).
 */
export function pathIsInsideScriptEmbedInlineTwig(path) {
    return someParentNode(path, n => n[SCRIPT_EMBED_INLINE_TWIG] === true);
}
