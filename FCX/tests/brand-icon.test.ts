import { describe, expect, it } from "vitest";

import { FCX_BRAND_ICON_DATA_URL } from "../src/ui/brand-icon";

describe("FCX brand icon", () => {
  it("embeds the complete desktop ICO without a remote dependency", () => {
    expect(FCX_BRAND_ICON_DATA_URL).toMatch(/^data:image\/x-icon;base64,/);
    const payload = FCX_BRAND_ICON_DATA_URL.split(",", 2)[1] ?? "";
    expect(Buffer.from(payload, "base64")).toHaveLength(24023);
  });
});
