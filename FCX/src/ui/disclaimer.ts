import type { GmValueAdapter } from "../remote/auth-store";
import { openFcxModal, type FcxModalHandle } from "./modal";

export const FCX_DISCLAIMER_VERSION = 1;
export const FCX_DISCLAIMER_STORAGE_KEY = "fcx.disclaimer.acceptedVersion";

export const FCX_SOFTWARE_DISCLAIMER = `本软件（一阵失心风FC助手）按"原样"提供，不提供任何形式的明示或暗示的保证，包括但不限于：

1. 软件功能完整性保证
   • 本软件可能包含错误、缺陷或功能不完整的情况
   • 开发者不保证软件能够满足您的特定需求
   • 软件功能可能因系统环境、网络状况等因素而受到影响

2. 软件可用性保证
   • 开发者不保证软件能够持续、稳定地运行
   • 软件可能因各种原因（包括但不限于系统更新、网络中断等）而无法使用
   • 开发者保留随时停止、修改或更新软件的权利

3. 数据安全保证
   • 使用本软件产生的任何数据丢失、损坏或泄露，开发者不承担任何责任
   • 建议用户定期备份重要数据
   • 用户应自行承担数据安全风险
   • 本软件并不读取用户游戏网页任何数据，对网页仅有逻辑操作
   • 本软件并不读取用户机器码相关以外的任何本地数据

4. 法律责任限制
   • 在任何情况下，开发者均不对因使用本软件而产生的任何直接、间接、偶然、特殊或后果性损害承担责任
   • 包括但不限于利润损失、数据丢失、业务中断等损失
   • 即使开发者已被告知可能发生此类损害

5. 技术支持
   • 开发者不提供任何形式的技术支持保证
   • 用户遇到问题时，开发者有权选择是否提供帮助
   • 任何技术支持均基于开发者的善意，不构成法律义务

6. 软件更新
   • 开发者不保证提供软件更新
   • 任何更新可能包含新的功能、修复或改进，也可能引入新的问题
   • 用户有权选择是否接受更新

通过使用本软件，您明确表示理解并同意上述所有条款。`;

export const FCX_GAMING_DISCLAIMER = `本软件与Electronic Arts Inc. (EA) 及其相关产品（包括但不限于FIFA、FC等）无任何关联：

1. 非官方软件
   • 本软件为第三方独立开发，与EA公司无任何商业或技术关联
   • 本软件不是EA官方产品，不得到EA的认可或支持
   • 使用本软件不会获得EA的任何官方支持或服务

2. 游戏账号风险
   • 使用本软件可能违反EA的服务条款或游戏规则
   • 可能导致游戏账号被限制、封禁或其他处罚
   • 用户应自行评估使用风险，开发者不承担任何责任
   • 建议用户在使用前仔细阅读EA的相关条款

3. 仅供学习交流
   • 本软件仅供学习、研究和交流使用
   • 不得用于商业用途或任何可能损害EA利益的行为
   • 用户应遵守当地法律法规和EA的服务条款

4. 游戏平衡性
   • 本软件可能影响游戏的公平性和平衡性
   • 用户应承担使用本软件可能带来的游戏体验变化
   • 开发者不保证软件不会对游戏平衡性产生负面影响

5. 第三方风险
   • 本软件可能与其他第三方软件或服务产生冲突
   • 用户应自行评估兼容性风险
   • 开发者不保证软件与其他工具的兼容性

6. 法律合规
   • 用户应确保使用本软件符合当地法律法规
   • 不得将本软件用于任何非法用途
   • 开发者不承担用户违法使用软件的法律责任

7. 游戏数据
   • 本软件可能访问、修改或传输游戏相关数据
   • 用户应了解并承担相关数据风险
   • 开发者不保证数据处理的准确性和安全性

8. 服务中断
   • EA可能随时更改其服务或API，导致本软件功能失效
   • 开发者不保证软件能够持续兼容EA的服务
   • 用户应理解并接受此类技术风险

使用本软件即表示您已充分了解上述风险，并同意自行承担所有相关责任。`;

export interface FcxDisclaimerDialogOptions {
  documentRef?: Document;
  storage?: GmValueAdapter;
  requireAcceptance?: boolean;
  persistenceWarningMs?: number;
}

export interface FcxDisclaimerDialogHandle extends FcxModalHandle {
  accepted?: Promise<boolean>;
}

function createDisclaimerSection(
  documentRef: Document,
  title: string,
  copy: string,
): HTMLElement {
  const section = documentRef.createElement("section");
  section.className = "fcx-disclaimer-section";
  const heading = documentRef.createElement("h3");
  heading.textContent = title;
  const body = documentRef.createElement("div");
  body.className = "fcx-disclaimer-copy";
  body.textContent = copy;
  section.append(heading, body);
  return section;
}

export function createFcxDisclaimerContent(documentRef: Document = document): HTMLElement {
  const content = documentRef.createElement("div");
  content.className = "fcx-disclaimer-content";
  const notice = documentRef.createElement("p");
  notice.className = "fcx-disclaimer-notice";
  notice.textContent =
    "⚠️ 使用本软件前，请确保您已充分了解并同意上述所有免责声明。\n" +
    "如您不同意任何条款，请立即停止使用本软件。";
  content.append(
    createDisclaimerSection(documentRef, "软件使用免责声明", FCX_SOFTWARE_DISCLAIMER),
    createDisclaimerSection(documentRef, "游戏相关免责声明", FCX_GAMING_DISCLAIMER),
    notice,
  );
  return content;
}

export function openFcxDisclaimerDialog(
  options: FcxDisclaimerDialogOptions = {},
): FcxDisclaimerDialogHandle {
  const documentRef = options.documentRef ?? document;
  const requireAcceptance = options.requireAcceptance === true;
  const modal = openFcxModal({
    id: requireAcceptance ? "fcx-disclaimer-consent-modal" : "fcx-disclaimer-modal",
    title: "免责声明",
    description: requireAcceptance
      ? "首次使用 FCX 前，请完整阅读并确认以下内容。"
      : "您可以随时重新查看 FCX 的软件与游戏相关声明。",
    content: createFcxDisclaimerContent(documentRef),
    documentRef,
    dismissible: !requireAcceptance,
  });
  modal.panel.classList.add("fcx-modal-panel--disclaimer");

  if (!requireAcceptance) {
    const closeButton = documentRef.createElement("button");
    closeButton.type = "button";
    closeButton.className = "fcx-button";
    closeButton.textContent = "关闭";
    closeButton.addEventListener("click", modal.close);
    modal.footer.appendChild(closeButton);
    return modal;
  }

  const status = documentRef.createElement("p");
  status.className = "fcx-modal-status";
  status.setAttribute("aria-live", "polite");
  const acceptButton = documentRef.createElement("button");
  acceptButton.type = "button";
  acceptButton.className = "fcx-button fcx-button--primary";
  acceptButton.textContent = "我已阅读并同意";
  modal.footer.append(status, acceptButton);

  let resolveAccepted!: (persisted: boolean) => void;
  const accepted = new Promise<boolean>((resolve) => {
    resolveAccepted = resolve;
  });
  let accepting = false;
  acceptButton.addEventListener("click", async () => {
    if (accepting) return;
    accepting = true;
    acceptButton.disabled = true;
    let persisted = true;
    try {
      if (!options.storage) throw new Error("免责声明存储不可用");
      await options.storage.set(FCX_DISCLAIMER_STORAGE_KEY, FCX_DISCLAIMER_VERSION);
    } catch (error) {
      persisted = false;
      status.textContent = "确认已生效，但未能保存；下次刷新仍会提示。";
      console.warn("[FCX][Disclaimer] acceptance could not be persisted", error);
      await new Promise((resolve) =>
        setTimeout(resolve, options.persistenceWarningMs ?? 1200),
      );
    }
    modal.close();
    resolveAccepted(persisted);
  });
  acceptButton.focus();
  return { ...modal, accepted };
}

export async function ensureFcxDisclaimerAccepted(
  storage: GmValueAdapter,
  documentRef: Document = document,
): Promise<boolean> {
  try {
    const acceptedVersion = await storage.get<number>(FCX_DISCLAIMER_STORAGE_KEY, 0);
    if (Number(acceptedVersion) >= FCX_DISCLAIMER_VERSION) return true;
  } catch (error) {
    console.warn("[FCX][Disclaimer] acceptance state could not be read", error);
  }

  const dialog = openFcxDisclaimerDialog({
    documentRef,
    storage,
    requireAcceptance: true,
  });
  return (await dialog.accepted) ?? false;
}
