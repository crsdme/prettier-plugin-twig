import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { format } from "prettier";
import plugin from "src/index";
import { run_spec } from "tests_config/run_spec";
import { describe, expect, it } from "vitest";

describe("Elements", () => {
    it("should support any valid html attributes so that things like AlpineJS work #37", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "alpinejs.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("should support single-quoted attribute values so that things like Vue.js work #122", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "vuejs.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("should handle attribute with twig comment", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "attribute_twig_comment.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("should handle attributes", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "attributes.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });
    it("should handle breaking siblings", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "breakingSiblings.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });
    it("should handle child elements", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "children.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });
    it("should remove multiple empty lines", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "emptyLines.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });
    it("should remove extra spaces within element brackets", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "extraSpaces.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });
    it("should handle many attributes", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "manyAttributes.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });
    it("convert inline elements to one line where possible", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "oneLine.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });
    it("should handle self closing elements", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "selfClosing.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });
    it("should handle siblings", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "siblings.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });
    it("should handle whitespace", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "whitespace.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("should handle ownline html element", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "ownline_html_element.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("should format embedded JavaScript and JSON in script tags", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "scriptFormatting.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("should repair glued statements inside script then format", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "scriptRepair.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("should repair carousel-style glued script (identifier before const, etc.)", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "scriptGlueCarousel.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("should format script with Twig (e.g. json_encode) via placeholder embed", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "scriptTwigInlineCarousel.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("should format script with Twig {% if %} branches via placeholder embed", async () => {
        const { actual, snapshotFile } = await run_spec(import.meta.url, {
            source: "scriptTwigIfCarousel.twig"
        });
        expect(actual).toMatchFileSnapshot(snapshotFile);
    });

    it("script Twig {% if %} embed output is stable when formatted twice (no stacked indent before endif)", async () => {
        const dirname = fileURLToPath(new URL(".", import.meta.url));
        const code = readFileSync(
            resolve(dirname, "scriptTwigIfCarousel.twig"),
            "utf8"
        );
        const opts = { parser: "twig", plugins: [plugin], tabWidth: 4 };
        const once = await format(code, opts);
        const twice = await format(once, opts);
        expect(twice).toBe(once);
    });
});
