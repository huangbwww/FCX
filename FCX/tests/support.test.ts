import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FCX_MINIPROGRAM_QR_DATA_URL } from "../src/ui/miniprogram-assets";
import { FCX_PAY_QR_DATA_URL } from "../src/ui/support-assets";
import {
  BILIBILI_ICON_SVG,
  DOUYIN_ICON_SVG,
  FCX_BILIBILI_URL,
  FCX_DOUYIN_URL,
  FCX_MINIPROGRAM_HEADER_BUTTON_ID,
  FCX_MINIPROGRAM_LOGIN_TIP,
  FCX_SUPPORT_HEADER_ID,
  FCX_SUPPORT_THANKS,
  FCX_VERSION_HEADER_BUTTON_ID,
  MINIPROGRAM_ICON_SVG,
  mountFcxHeaderSupport,
  openFcxMiniProgramDialog,
  openFcxSupportDialog,
  type FcxHeaderSupportHandle,
} from "../src/ui/support";

function createNavigationBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "ut-navigation-bar-view";
  const title = document.createElement("h1");
  title.className = "title";
  title.textContent = "自动SBC";
  const enhancer = document.createElement("a");
  enhancer.className = "app-logo";
  enhancer.textContent = "FC Enhancer";
  const thirdParty = document.createElement("div");
  thirdParty.id = "third-party-header-actions";
  thirdParty.textContent = "Third-party extension";
  const currency = document.createElement("div");
  currency.className = "view-navbar-currency";
  currency.textContent = "179,395";
  bar.append(title, enhancer, thirdParty, currency);
  return bar;
}

describe("FCX header support and feedback", () => {
  let handle: FcxHeaderSupportHandle | undefined;

  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    handle?.stop();
    handle = undefined;
    document.body.replaceChildren();
  });

  it("mounts immediately after the title without moving third-party header items", () => {
    const bar = createNavigationBar();
    document.body.appendChild(bar);
    const onVersionClick = vi.fn();
    handle = mountFcxHeaderSupport(document, {
      currentVersion: "26.0.1",
      onVersionClick,
    });

    expect(Array.from(bar.children).map((child) => child.id || child.className)).toEqual([
      "title",
      FCX_SUPPORT_HEADER_ID,
      "app-logo",
      "third-party-header-actions",
      "view-navbar-currency",
    ]);
    expect(bar.querySelector("#third-party-header-actions")?.textContent)
      .toBe("Third-party extension");
    expect(bar.querySelector(".app-logo")?.textContent).toBe("FC Enhancer");
    const buttons = Array.from(
      handle.root?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.textContent?.trim()).toBe("捐赠/反馈");
    expect(buttons[1]?.textContent?.trim()).toBe("小程序");
    expect(buttons[0]?.getAttribute("aria-label"))
      .toBe("打开捐赠与反馈");
    expect(buttons[1]?.id).toBe(FCX_MINIPROGRAM_HEADER_BUTTON_ID);
    expect(buttons[1]?.getAttribute("aria-label")).toBe("打开 FCX 小程序");
    expect(buttons[2]?.id).toBe(FCX_VERSION_HEADER_BUTTON_ID);
    expect(buttons[2]?.querySelector(".fcx-header-version__full")?.textContent)
      .toBe("v26.0.1");

    buttons[0]?.click();
    expect(document.getElementById("fcx-support-modal")).not.toBeNull();
    document.getElementById("fcx-support-modal")?.remove();
    buttons[1]?.click();
    expect(document.getElementById("fcx-miniprogram-modal")).not.toBeNull();
    document.getElementById("fcx-miniprogram-modal")?.remove();
    buttons[2]?.click();
    expect(onVersionClick).toHaveBeenCalledOnce();

    handle.setVersionState({
      currentVersion: "26.0.1",
      latestVersion: "26.0.2",
      state: "update",
    });
    expect(buttons[2]?.dataset.state).toBe("update");
    expect(buttons[2]?.querySelector(".fcx-header-version__full")?.textContent)
      .toBe("新版本 26.0.2");
    expect(buttons[2]?.querySelector(".fcx-header-version__compact")?.textContent)
      .toBe("v26.0.2");
  });

  it("is idempotent and remounts when EA replaces the navigation bar", async () => {
    const firstBar = createNavigationBar();
    document.body.appendChild(firstBar);
    handle = mountFcxHeaderSupport(document);
    const sameHandle = mountFcxHeaderSupport(document);
    expect(sameHandle).toBe(handle);
    expect(document.querySelectorAll(`#${FCX_SUPPORT_HEADER_ID}`)).toHaveLength(1);

    const replacement = createNavigationBar();
    firstBar.replaceWith(replacement);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replacement.querySelectorAll(`#${FCX_SUPPORT_HEADER_ID}`)).toHaveLength(1);
    expect(replacement.querySelectorAll(`#${FCX_MINIPROGRAM_HEADER_BUTTON_ID}`))
      .toHaveLength(1);
    expect(replacement.querySelectorAll(`#${FCX_VERSION_HEADER_BUTTON_ID}`))
      .toHaveLength(1);
  });

  it("copies the desktop donation content and keeps feedback limited to WeChat", () => {
    const modal = openFcxSupportDialog(document);
    expect(modal.root.textContent).toContain("亲爱的用户，感谢您选择使用一阵失心风FC助手");
    expect(modal.root.textContent).toContain(FCX_SUPPORT_THANKS);
    expect(modal.root.textContent).toContain("Fangzzz007");
    expect(modal.root.textContent).toContain("如有问题或建议，请添加微信 Fangzzz007 反馈");
    expect(modal.root.textContent).not.toContain("操作日志");
    expect(modal.root.querySelector<HTMLImageElement>(".fcx-support-qr")?.src)
      .toBe(FCX_PAY_QR_DATA_URL);
    const links = Array.from(modal.root.querySelectorAll<HTMLAnchorElement>("a"));
    expect(links.map((link) => link.href)).toEqual([FCX_DOUYIN_URL, FCX_BILIBILI_URL]);
    expect(links.every((link) => link.rel === "noopener noreferrer")).toBe(true);
    modal.close();
  });

  it("embeds the complete payment QR and local platform SVG icons", () => {
    const payload = FCX_PAY_QR_DATA_URL.split(",", 2)[1] ?? "";
    expect(Buffer.from(payload, "base64")).toHaveLength(47652);
    expect(DOUYIN_ICON_SVG).toContain("<svg");
    expect(BILIBILI_ICON_SVG).toContain("<svg");
    expect(DOUYIN_ICON_SVG).not.toContain("http");
    expect(BILIBILI_ICON_SVG).not.toContain("http");
  });

  it("shows the embedded mini program code and account guidance", () => {
    const modal = openFcxMiniProgramDialog(document);
    expect(modal.root.textContent).toContain("FCX 小程序");
    expect(modal.root.textContent).toContain(FCX_MINIPROGRAM_LOGIN_TIP);
    expect(modal.root.textContent).toContain("FCX设置");
    expect(modal.root.textContent).toContain("账号与远程控制");
    const qr = modal.root.querySelector<HTMLImageElement>(".fcx-miniprogram-qr");
    expect(qr?.src).toBe(FCX_MINIPROGRAM_QR_DATA_URL);
    expect(qr?.alt).toBe("一阵失心风 FCX 微信小程序码");
    modal.close();
  });

  it("embeds the original 430 by 430 mini program PNG and local icon", () => {
    expect(FCX_MINIPROGRAM_QR_DATA_URL).toMatch(/^data:image\/png;base64,/);
    const payload = FCX_MINIPROGRAM_QR_DATA_URL.split(",", 2)[1] ?? "";
    const bytes = Buffer.from(payload, "base64");
    expect(bytes).toHaveLength(162541);
    expect(bytes.readUInt32BE(16)).toBe(430);
    expect(bytes.readUInt32BE(20)).toBe(430);
    expect(MINIPROGRAM_ICON_SVG).toContain("<svg");
    expect(MINIPROGRAM_ICON_SVG).not.toContain("http");
  });
});
