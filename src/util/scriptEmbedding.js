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

export function getPlainScriptSource(children) {
    if (!children?.length) {
        return "";
    }
    return children.map(c => c.value.value).join("");
}
