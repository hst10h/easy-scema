import { describe, expect, it } from "vitest";
import { countMissingFields, countReviewIssues, inferFieldType, isValidFieldValue, normalizeKey } from "./extraction";

describe("normalizeKey", () => {
  it("normalizes Vietnamese labels and punctuation", () => {
    expect(normalizeKey("Đơn Giá (USD)")).toBe("don_gia_usd");
  });

  it("removes leading and trailing separators", () => {
    expect(normalizeKey("  -- SKU --  ")).toBe("sku");
  });
});

describe("countMissingFields", () => {
  const fields = [{ key: "sku", label: "SKU" }, { key: "price", label: "Price" }];

  it("counts absent, empty and whitespace-only values", () => {
    expect(countMissingFields([{ sku: "A", price: "" }, { sku: " ", price: 12 }, { sku: "B" }], fields)).toBe(3);
  });
});

describe("field type validation", () => {
  it("infers numbers and dates from template examples", () => {
    expect(inferFieldType(["1,200", "2.50"])).toBe("number");
    expect(inferFieldType(["2026-08-29", "2026-09-01"])).toBe("date");
  });

  it("flags non-empty invalid values for review", () => {
    const field = { key: "price", label: "Price", dataType: "number" as const };
    expect(isValidFieldValue("12.50", field)).toBe(true);
    expect(isValidFieldValue("call us", field)).toBe(false);
    expect(countReviewIssues([{ price: "call us" }, { price: "" }], [field])).toBe(2);
  });
});
