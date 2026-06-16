import { describe, it, expect } from "vitest";
import { parseCsv } from "~/lib/csv";

describe("parseCsv", () => {
  it("parses headers and rows", () => {
    const { headers, rows } = parseCsv("name,price,unit\nTomatoes,3.50,lb\nKale,2.75,bunch\n");
    expect(headers).toEqual(["name", "price", "unit"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Tomatoes", price: "3.50", unit: "lb" });
    expect(rows[1].unit).toBe("bunch");
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const { rows } = parseCsv('name,note\n"Beets, red","sweet ""heirloom"""\n');
    expect(rows[0].name).toBe("Beets, red");
    expect(rows[0].note).toBe('sweet "heirloom"');
  });

  it("ignores trailing blank lines", () => {
    const { rows } = parseCsv("a,b\n1,2\n\n");
    expect(rows).toHaveLength(1);
  });
});
