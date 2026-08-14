import { describe, expect, it } from "vitest";
import { appendUniqueInventoryItems } from "../src/domain/inventory/pagination";

describe("inventory pagination", () => {
  it("accumulates all pages and removes duplicate instance ids", () => {
    const first = [{ id: 1 }, { id: 2 }];
    const second = [{ id: 2 }, { id: 3 }];
    expect(appendUniqueInventoryItems(first, second).map((item) => item.id)).toEqual([
      1, 2, 3,
    ]);
  });

  it("keeps items without a valid instance id instead of collapsing them", () => {
    expect(appendUniqueInventoryItems([{ id: 0 }], [{ id: 0 }, {}])).toHaveLength(3);
  });
});
