import { doc } from "prettier";
import { Node } from "../melody/melody-types/index.js";
import {
    EXPRESSION_NEEDED,
    STRING_NEEDS_QUOTES,
    isContractableNodeType,
    someParentNode
} from "../util/index.js";
import { SCRIPT_EMBED_INLINE_TWIG } from "../util/publicSymbols.js";

const { group, indent, line } = doc.builders;

const inlineTwigFromScriptEmbed = path =>
    someParentNode(path, n => n[SCRIPT_EMBED_INLINE_TWIG] === true);

const printExpressionStatement = (node, path, print) => {
    node[EXPRESSION_NEEDED] = false;
    node[STRING_NEEDS_QUOTES] = true;
    const opener = node.trimLeft ? "{{-" : "{{";
    const closing = node.trimRight ? "-}}" : "}}";
    const shouldContractValue =
        inlineTwigFromScriptEmbed(path) ||
        (isContractableNodeType(node.value) &&
            !Node.isObjectExpression(node.value));
    const padding = shouldContractValue ? " " : line;
    const printedValue = [padding, path.call(print, "value")];
    const value = shouldContractValue ? printedValue : indent(printedValue);
    return group([opener, value, padding, closing]);
};

export { printExpressionStatement };
