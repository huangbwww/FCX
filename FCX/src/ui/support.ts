import { FCX_BRAND_ICON_DATA_URL } from "./brand-icon";
import { FCX_MINIPROGRAM_QR_DATA_URL } from "./miniprogram-assets";
import { openFcxModal, type FcxModalHandle } from "./modal";
import { FCX_PAY_QR_DATA_URL } from "./support-assets";

export const FCX_SUPPORT_HEADER_ID = "fcx-header-support";
export const FCX_MINIPROGRAM_HEADER_BUTTON_ID = "fcx-header-miniprogram-button";
export const FCX_VERSION_HEADER_BUTTON_ID = "fcx-header-version-button";
export const FCX_DOUYIN_URL = "https://www.douyin.com/search/97129992611";
export const FCX_BILIBILI_URL = "https://space.bilibili.com/698078048";
export const FCX_MINIPROGRAM_LOGIN_TIP =
  "使用前请先进入左侧「FCX设置」→「账号与远程控制」，完成注册并登录；小程序需登录同一账号。";
export const FCX_SUPPORT_THANKS = `亲爱的用户，感谢您选择使用一阵失心风FC助手！

您的支持是我持续改进和开发新功能的动力。每一份打赏都让我感受到您的认可和鼓励，

这让我更加坚定地要为用户提供更好的服务。

无论金额多少，您的每一份心意都让我倍感温暖。
我会继续努力，为大家带来更多实用的功能和更好的使用体验。

再次感谢您的支持与信任！`;

export const DOUYIN_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M14.2 3.5c.45 2.48 1.82 3.95 4.3 4.38v3.02a8.15 8.15 0 0 1-4.3-1.42v5.22a5.36 5.36 0 1 1-4.62-5.31v3.08a2.35 2.35 0 1 0 1.58 2.23V3.5h3.04Z" fill="currentColor"/>
  </svg>`;

export const BILIBILI_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="m8.2 3 2.05 2.25h3.5L15.8 3l1.45 1.32-.85.93h1.35A3.25 3.25 0 0 1 21 8.5v8.25A3.25 3.25 0 0 1 17.75 20H6.25A3.25 3.25 0 0 1 3 16.75V8.5a3.25 3.25 0 0 1 3.25-3.25H7.6l-.85-.93L8.2 3Zm-1.95 4.5a1 1 0 0 0-1 1v8.25a1 1 0 0 0 1 1h11.5a1 1 0 0 0 1-1V8.5a1 1 0 0 0-1-1H6.25Zm2.5 3.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm6.5 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z" fill="currentColor"/>
  </svg>`;

export const MINIPROGRAM_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7.15 4.5a3.65 3.65 0 1 0 0 7.3h2.2a2.15 2.15 0 0 1 0 4.3H7.1v2.4h2.25a4.55 4.55 0 0 0 0-9.1h-2.2a1.25 1.25 0 1 1 0-2.5H9.4V4.5H7.15Zm7.5 0a4.55 4.55 0 0 0 0 9.1h2.2a1.25 1.25 0 1 1 0 2.5H14.6v2.4h2.25a3.65 3.65 0 1 0 0-7.3h-2.2a2.15 2.15 0 0 1 0-4.3h2.25V4.5h-2.25Z" fill="currentColor"/>
  </svg>`;

function createExternalLink(
  documentRef: Document,
  label: string,
  href: string,
  icon: string,
  platform: "douyin" | "bilibili",
): HTMLAnchorElement {
  const link = documentRef.createElement("a");
  link.className = `fcx-support-social-link fcx-support-social-link--${platform}`;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", label);
  link.innerHTML = `${icon}<span>${label}</span>`;
  return link;
}

export function openFcxSupportDialog(documentRef: Document = document): FcxModalHandle {
  const content = documentRef.createElement("div");
  content.className = "fcx-support-dialog";

  const thanks = documentRef.createElement("section");
  thanks.className = "fcx-support-thanks";
  const thanksTitle = documentRef.createElement("h3");
  thanksTitle.textContent = "感谢您的支持";
  const thanksCopy = documentRef.createElement("p");
  thanksCopy.className = "fcx-support-thanks-copy";
  thanksCopy.textContent = FCX_SUPPORT_THANKS;
  thanks.append(thanksTitle, thanksCopy);

  const grid = documentRef.createElement("div");
  grid.className = "fcx-support-grid";
  const donation = documentRef.createElement("section");
  donation.className = "fcx-support-panel fcx-support-donation";
  const donationTitle = documentRef.createElement("h3");
  donationTitle.textContent = "支付宝捐赠";
  const qr = documentRef.createElement("img");
  qr.className = "fcx-support-qr";
  qr.src = FCX_PAY_QR_DATA_URL;
  qr.alt = "一阵失心风FC助手支付宝捐赠二维码";
  const donationHint = documentRef.createElement("p");
  donationHint.textContent = "请使用支付宝扫描二维码进行捐赠。";
  donation.append(donationTitle, qr, donationHint);

  const contact = documentRef.createElement("section");
  contact.className = "fcx-support-panel fcx-support-contact";
  contact.innerHTML = `
    <h3>联系与反馈</h3>
    <dl>
      <div><dt>微信</dt><dd>Fangzzz007</dd></div>
      <div><dt>抖音</dt><dd>一阵失心风</dd></div>
      <div><dt>B站</dt><dd>一阵失心风</dd></div>
      <div><dt>公众号</dt><dd>一阵失心风</dd></div>
    </dl>
    <p class="fcx-support-feedback">如有问题或建议，请添加微信 Fangzzz007 反馈。</p>`;
  const social = documentRef.createElement("div");
  social.className = "fcx-support-socials";
  social.append(
    createExternalLink(documentRef, "关注抖音", FCX_DOUYIN_URL, DOUYIN_ICON_SVG, "douyin"),
    createExternalLink(documentRef, "关注B站", FCX_BILIBILI_URL, BILIBILI_ICON_SVG, "bilibili"),
  );
  contact.appendChild(social);
  grid.append(donation, contact);
  content.append(thanks, grid);

  const modal = openFcxModal({
    id: "fcx-support-modal",
    title: "捐赠/反馈",
    description: "感谢您的支持，也欢迎反馈问题和建议。",
    content,
    documentRef,
  });
  modal.panel.classList.add("fcx-modal-panel--support");
  const closeButton = documentRef.createElement("button");
  closeButton.type = "button";
  closeButton.className = "fcx-button";
  closeButton.textContent = "关闭";
  closeButton.addEventListener("click", modal.close);
  modal.footer.appendChild(closeButton);
  return modal;
}

export function openFcxMiniProgramDialog(
  documentRef: Document = document,
): FcxModalHandle {
  const content = documentRef.createElement("div");
  content.className = "fcx-miniprogram-dialog";

  const qrFrame = documentRef.createElement("div");
  qrFrame.className = "fcx-miniprogram-qr-frame";
  const qr = documentRef.createElement("img");
  qr.className = "fcx-miniprogram-qr";
  qr.src = FCX_MINIPROGRAM_QR_DATA_URL;
  qr.alt = "一阵失心风 FCX 微信小程序码";
  qrFrame.appendChild(qr);

  const tip = documentRef.createElement("p");
  tip.className = "fcx-miniprogram-login-tip";
  tip.textContent = FCX_MINIPROGRAM_LOGIN_TIP;
  content.append(qrFrame, tip);

  const modal = openFcxModal({
    id: "fcx-miniprogram-modal",
    title: "FCX 小程序",
    description: "扫码打开小程序，查看脚本状态并使用远程控制。",
    content,
    documentRef,
  });
  modal.panel.classList.add("fcx-modal-panel--miniprogram");
  const closeButton = documentRef.createElement("button");
  closeButton.type = "button";
  closeButton.className = "fcx-button";
  closeButton.textContent = "关闭";
  closeButton.addEventListener("click", modal.close);
  modal.footer.appendChild(closeButton);
  return modal;
}

export interface FcxHeaderSupportHandle {
  readonly root: HTMLElement | null;
  refresh(): HTMLElement | null;
  setVersionState(state: FcxHeaderVersionState): void;
  stop(): void;
}

export interface FcxHeaderVersionState {
  currentVersion: string;
  latestVersion?: string;
  state: "idle" | "checking" | "current" | "update";
}

export interface FcxHeaderSupportOptions {
  currentVersion?: string;
  onVersionClick?: () => void;
}

const headerSupportByDocument = new WeakMap<Document, FcxHeaderSupportHandle>();

export function mountFcxHeaderSupport(
  documentRef: Document = document,
  options: FcxHeaderSupportOptions = {},
): FcxHeaderSupportHandle {
  const mounted = headerSupportByDocument.get(documentRef);
  if (mounted) {
    mounted.refresh();
    return mounted;
  }

  let root: HTMLElement | null = null;
  let versionState: FcxHeaderVersionState = {
    currentVersion: options.currentVersion ?? "--",
    state: "idle",
  };
  const renderVersionState = () => {
    const button = root?.querySelector<HTMLButtonElement>(
      `#${FCX_VERSION_HEADER_BUTTON_ID}`,
    );
    if (!button) return;
    const latestVersion = versionState.latestVersion ?? versionState.currentVersion;
    const fullLabel = button.querySelector<HTMLElement>(".fcx-header-version__full");
    const compactLabel = button.querySelector<HTMLElement>(
      ".fcx-header-version__compact",
    );
    let fullText = `v${versionState.currentVersion}`;
    if (versionState.state === "checking") fullText = "检查中";
    if (versionState.state === "update") fullText = `新版本 ${latestVersion}`;
    if (fullLabel) fullLabel.textContent = fullText;
    if (compactLabel) compactLabel.textContent = `v${latestVersion}`;
    button.dataset.state = versionState.state;
    button.title = versionState.state === "update"
      ? `发现新版本 ${latestVersion}`
      : `当前版本 v${versionState.currentVersion}`;
    button.setAttribute(
      "aria-label",
      versionState.state === "update"
        ? `发现 FCX 新版本 ${latestVersion}，点击查看`
        : `检查 FCX 更新，当前版本 ${versionState.currentVersion}`,
    );
  };
  const refresh = (): HTMLElement | null => {
    const navigationBar = documentRef.querySelector<HTMLElement>(".ut-navigation-bar-view");
    const title = navigationBar?.querySelector<HTMLElement>(":scope > .title");
    if (!navigationBar || !title) return null;
    if (root?.isConnected && root.parentElement === navigationBar) return root;

    documentRef.getElementById(FCX_SUPPORT_HEADER_ID)?.remove();
    root = documentRef.createElement("div");
    root.id = FCX_SUPPORT_HEADER_ID;
    root.className = "fcx-header-actions";
    const supportButton = documentRef.createElement("button");
    supportButton.type = "button";
    supportButton.className =
      "fcx-header-support-button fcx-header-support-button--donation";
    supportButton.title = "捐赠/反馈";
    supportButton.setAttribute("aria-label", "打开捐赠与反馈");
    const icon = documentRef.createElement("img");
    icon.src = FCX_BRAND_ICON_DATA_URL;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    const label = documentRef.createElement("span");
    label.textContent = "捐赠/反馈";
    supportButton.append(icon, label);
    supportButton.addEventListener("click", () => openFcxSupportDialog(documentRef));

    const miniProgramButton = documentRef.createElement("button");
    miniProgramButton.id = FCX_MINIPROGRAM_HEADER_BUTTON_ID;
    miniProgramButton.type = "button";
    miniProgramButton.className =
      "fcx-header-support-button fcx-header-support-button--miniprogram";
    miniProgramButton.title = "小程序";
    miniProgramButton.setAttribute("aria-label", "打开 FCX 小程序");
    miniProgramButton.innerHTML = `${MINIPROGRAM_ICON_SVG}<span>小程序</span>`;
    miniProgramButton.addEventListener("click", () =>
      openFcxMiniProgramDialog(documentRef)
    );

    const versionButton = documentRef.createElement("button");
    versionButton.id = FCX_VERSION_HEADER_BUTTON_ID;
    versionButton.type = "button";
    versionButton.className =
      "fcx-header-support-button fcx-header-version-button";
    const statusDot = documentRef.createElement("i");
    statusDot.className = "fcx-header-version__dot";
    statusDot.setAttribute("aria-hidden", "true");
    const versionFull = documentRef.createElement("span");
    versionFull.className = "fcx-header-version__full";
    const versionCompact = documentRef.createElement("span");
    versionCompact.className = "fcx-header-version__compact";
    versionButton.append(statusDot, versionFull, versionCompact);
    versionButton.addEventListener("click", () => options.onVersionClick?.());

    root.append(supportButton, miniProgramButton, versionButton);
    title.insertAdjacentElement("afterend", root);
    renderVersionState();
    return root;
  };

  const MutationObserverImpl = documentRef.defaultView?.MutationObserver ?? MutationObserver;
  const observer = new MutationObserverImpl(() => {
    if (!root?.isConnected) refresh();
  });
  observer.observe(documentRef.body ?? documentRef.documentElement, {
    childList: true,
    subtree: true,
  });

  const handle: FcxHeaderSupportHandle = {
    get root() { return root; },
    refresh,
    setVersionState(state) {
      versionState = state;
      renderVersionState();
    },
    stop() {
      observer.disconnect();
      root?.remove();
      root = null;
      headerSupportByDocument.delete(documentRef);
    },
  };
  headerSupportByDocument.set(documentRef, handle);
  refresh();
  return handle;
}
