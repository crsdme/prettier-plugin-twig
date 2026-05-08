import { doc } from "prettier";
import { Node } from "./melody/melody-types/index.js";
import { printElementOpeningTag } from "./print/Element.js";
import {
    EXPRESSION_NEEDED,
    STRING_NEEDS_QUOTES
} from "./util/publicSymbols.js";
import {
    getPlainScriptSource,
    getScriptTypeAttribute,
    hasSrcAttribute,
    scriptBodyParserForType,
    scriptChildrenArePlainText
} from "./util/scriptEmbedding.js";
import { repairConcatenatedStatements } from "./util/repairScriptSource.js";

const { group, hardline, indent } = doc.builders;

/**
 * @type {import("prettier").Printer["embed"]}
 */
export function embed(path, options) {
    if (options.embeddedLanguageFormatting === "off") {
        return undefined;
    }

    const node = path.getValue();
    if (!node || !Node.isElement(node)) {
        return undefined;
    }
    if (node.name.toLowerCase() !== "script") {
        return undefined;
    }
    if (node.selfClosing) {
        return undefined;
    }

    const typeAttr = getScriptTypeAttribute(node);
    if (typeAttr === null) {
        return undefined;
    }

    const parser = scriptBodyParserForType(typeAttr);
    if (!parser) {
        return undefined;
    }

    if (hasSrcAttribute(node)) {
        return undefined;
    }

    const children = node.children;
    if (!scriptChildrenArePlainText(children)) {
        return undefined;
    }

    const raw = getPlainScriptSource(children);
    const trimmed = raw.trim();

    return async (textToDoc, print) => {
        node[EXPRESSION_NEEDED] = true;
        const openingGroup = group(
            printElementOpeningTag(node, path, print, options)
        );
        node[EXPRESSION_NEEDED] = false;
        node[STRING_NEEDS_QUOTES] = false;

        const closingTag = ["</", node.name, ">"];

        if (trimmed === "") {
            return group([openingGroup, closingTag]);
        }

        const formatEmbedded = code =>
            textToDoc(code, {
                ...options,
                parser
            });

        try {
            const innerDoc = await formatEmbedded(trimmed);
            return group([
                openingGroup,
                indent([hardline, innerDoc]),
                hardline,
                closingTag
            ]);
        } catch {
            if (parser !== "babel") {
                return undefined;
            }
            const repaired = repairConcatenatedStatements(trimmed);
            if (repaired === trimmed) {
                return undefined;
            }
            try {
                const innerDoc = await formatEmbedded(repaired);
                return group([
                    openingGroup,
                    indent([hardline, innerDoc]),
                    hardline,
                    closingTag
                ]);
            } catch {
                return undefined;
            }
        }
    };
}
