import { describe, expect, it } from "vitest";
import { repairConcatenatedStatements } from "src/util/repairScriptSource.js";

describe("repairConcatenatedStatements", () => {
    it("inserts newline before const after call", () => {
        expect(
            repairConcatenatedStatements(
                "document.getElementById('carousel-dots') const dots = 1"
            )
        ).toBe("document.getElementById('carousel-dots')\n const dots = 1");
    });

    it("inserts newline before property access chain after call", () => {
        expect(
            repairConcatenatedStatements(
                "embla.selectedScrollSnap() dots.forEach(x)"
            )
        ).toBe("embla.selectedScrollSnap()\n dots.forEach(x)");
    });

    it("runs multiple passes when needed", () => {
        const input = "a() const x = 1\ny() z.method()";
        const out = repairConcatenatedStatements(input);
        expect(out).toContain("a()\n");
        expect(out).toContain("y()\n");
    });

    it("inserts newline before function after a numeric literal", () => {
        expect(
            repairConcatenatedStatements("const data = 123 function test() {}")
        ).toBe("const data = 123\n function test() {}");
    });
});
