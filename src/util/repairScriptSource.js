/**
 * When several statements are written on one line without `;` or line breaks,
 * Babel cannot parse the file. These regexes insert newlines in common cases
 * so Prettier can format them (best-effort; run only after parse fails).
 *
 * Does not track strings/comments — only used as a fallback when parsing already failed.
 */

/** Same-line gaps only — `\s` would eat `\n` and re-trigger rules forever. */
const GAP = "[ \\t]";
const GAP_OPT = `${GAP}*`;
const GAP_1 = `${GAP}+`;

const RULES = [
    [
        new RegExp(`(\\)|\\]|\\})(${GAP_OPT})(?=\\b(?:const|let|var)\\b)`, "g"),
        "$1\n$2"
    ],
    [
        new RegExp(
            `(\\)|\\]|\\})(${GAP_OPT})(?=\\b(?:if|for|while|switch|try|return|throw|do)\\b)`,
            "g"
        ),
        "$1\n$2"
    ],
    [
        new RegExp(
            `(\\)|\\]|\\})(${GAP_OPT})(?=\\b(?:async\\s+)?function\\b)`,
            "g"
        ),
        "$1\n$2"
    ],
    [
        new RegExp(`(\\d+)(${GAP_1})(?=\\b(?:async\\s+)?function\\b)`, "g"),
        "$1\n$2"
    ],
    [
        new RegExp(`(\\)|\\]|\\})(${GAP_1})(?=[a-zA-Z_$][\\w$]*\\s*\\.)`, "g"),
        "$1\n$2"
    ],
    [
        new RegExp(`(\\)|\\]|\\})(${GAP_1})(?=[a-zA-Z_$][\\w$]*\\s*\\()`, "g"),
        "$1\n$2"
    ]
];

/**
 * @param {string} source
 * @returns {string}
 */
export function repairConcatenatedStatements(source) {
    let prev;
    let s = source;
    let guard = 0;
    do {
        prev = s;
        for (const [pattern, replacement] of RULES) {
            s = s.replace(pattern, replacement);
        }
        guard++;
    } while (s !== prev && guard < 24);
    return s;
}
