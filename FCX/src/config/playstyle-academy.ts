import snapshot from "./academy-snapshot.json";
import type {
  AcademyRoleRecommendation,
  AcademySlotReference,
  PlayStyleAcademyConfig,
  PlayStyleAcademyDefinition,
} from "../types/academy";

export const ACADEMY_CONFIG_SCHEMA_VERSION = 1;
export const ACADEMY_CONFIG_CAPTURED_AT = "2026-08-07";

export const ACADEMY_ROLE_LABELS: Record<string, string> = {
  "shadow-striker": "影子前锋",
  playmaker: "组织核心",
  "classic-10": "古典十号位",
  "half-winger": "半边锋",
  defender: "防守者",
  stopper: "上抢中卫",
  "wide-back": "边中卫",
  "ball-playing-defender": "出球中卫",
  holding: "防守型后腰",
  "deep-lying-playmaker": "拖后组织核心",
  "box-crasher": "后插上中场",
  "centre-half": "中卫型后腰",
  "wide-half": "边路后腰",
  "box-to-box": "全能中场",
  goalkeeper: "传统门将",
  "ball-playing": "出球门将",
  "sweeper-keeper": "清道夫门将",
  fullback: "边后卫",
  wingback: "翼卫",
  falseback: "伪边后卫",
  "inverted-wingback": "内收翼卫",
  "attacking-wingback": "进攻型翼卫",
  "inside-forward": "内锋",
  winger: "边锋",
  "wide-playmaker": "边路组织核心",
  "wide-midfielder": "边前卫",
  "advanced-forward": "突前前锋",
  "target-forward": "支点前锋",
  poacher: "抢点前锋",
  "false-9": "伪九号",
};

const STYLE_METADATA = [
  ["finesse-shot", "精准射门", 0, "射门", false],
  ["chip-shot", "挑射", 1, "射门", false],
  ["power-shot", "强力射门", 2, "射门", false],
  ["dead-ball", "定位球", 3, "射门", false],
  ["precision-header", "精准头球", 4, "射门", false],
  ["acrobatic", "杂技", 5, "射门", false],
  ["low-driven-shot", "低射", 6, "射门", false],
  ["gamechanger", "比赛改变者", 7, "射门", false],
  ["incisive-pass", "穿透传球", 8, "传球", false],
  ["pinged-pass", "快速传球", 9, "传球", false],
  ["long-ball-pass", "长传", 10, "传球", false],
  ["tiki-taka", "Tiki Taka", 11, "传球", false],
  ["whipped-pass", "弧线传中", 12, "传球", false],
  ["inventive", "创造力", 13, "传球", false],
  ["jockey", "螃蟹步", 14, "防守", false],
  ["block", "封堵", 15, "防守", false],
  ["intercept", "拦截", 16, "防守", false],
  ["anticipate", "预判", 17, "防守", false],
  ["slide-tackle", "滑铲", 18, "防守", false],
  ["aerial-fortress", "空中堡垒", 19, "防守", false],
  ["technical", "技术", 20, "控球", false],
  ["rapid", "迅捷", 21, "控球", false],
  ["first-touch", "第一脚触球", 22, "控球", false],
  ["trickster", "花式", 23, "控球", false],
  ["press-proven", "抗压", 24, "控球", false],
  ["quick-step", "快速启动", 25, "身体", false],
  ["relentless", "不懈", 26, "身体", false],
  ["long-throw", "大力界外球", 27, "身体", false],
  ["bruiser", "强硬", 28, "身体", false],
  ["enforcer", "压迫者", 29, "身体", false],
  ["far-throw", "大力手抛球", 30, "门将", true],
  ["footwork", "脚下技术", 31, "门将", true],
  ["cross-claimer", "出击摘传中", 32, "门将", true],
  ["1v1-close-down", "单刀封堵", 33, "门将", true],
  ["far-reach", "远距离扑救", 34, "门将", true],
  ["deflector", "扑挡", 35, "门将", true],
] as const;

type RawSnapshot = {
  limits: { basic: number; plus: number };
  eligibleRarities: number[];
  evolutions: Record<
    string,
    { base?: AcademySlotReference; plus?: AcademySlotReference }
  >;
  recommendations: Record<string, AcademyRoleRecommendation[]>;
};

function validSlot(value: unknown): value is AcademySlotReference {
  const slot = value as Partial<AcademySlotReference> | null;
  return Boolean(
    slot &&
      Number.isSafeInteger(slot.slotId) &&
      Number(slot.slotId) > 0 &&
      Number.isSafeInteger(slot.rewardId) &&
      Number(slot.rewardId) > 0,
  );
}

export function createPlayStyleAcademyConfig(
  raw: RawSnapshot,
): PlayStyleAcademyConfig {
  if (!Number.isInteger(raw.limits.basic) || raw.limits.basic < 1) {
    throw new Error("学院基础 PlayStyle 上限无效");
  }
  if (!Number.isInteger(raw.limits.plus) || raw.limits.plus < 0) {
    throw new Error("学院 PlayStyle+ 上限无效");
  }
  const knownKeys = new Set<string>(STYLE_METADATA.map(([key]) => key));
  const definitions: PlayStyleAcademyDefinition[] = STYLE_METADATA.map(
    ([key, name, traitId, category, goalkeeperOnly]) => {
      const slots = raw.evolutions[key] ?? {};
      return {
        key,
        name,
        traitId,
        category,
        goalkeeperOnly,
        base: validSlot(slots.base) ? slots.base : null,
        plus: validSlot(slots.plus) ? slots.plus : null,
      };
    },
  );
  if (!definitions.some((definition) => definition.base || definition.plus)) {
    throw new Error("学院配置没有有效槽位");
  }
  for (const roles of Object.values(raw.recommendations)) {
    if (!Array.isArray(roles)) throw new Error("学院角色推荐格式无效");
    for (const recommendation of roles) {
      if (
        !recommendation.role ||
        !Array.isArray(recommendation.playStyles) ||
        recommendation.playStyles.some((key) => !knownKeys.has(key))
      ) {
        throw new Error("学院角色推荐包含未知 PlayStyle");
      }
    }
  }
  return {
    schemaVersion: ACADEMY_CONFIG_SCHEMA_VERSION,
    capturedAt: ACADEMY_CONFIG_CAPTURED_AT,
    limits: { ...raw.limits },
    eligibleRarities: raw.eligibleRarities
      .map(Number)
      .filter((value) => Number.isFinite(value)),
    definitions,
    recommendations: structuredClone(raw.recommendations),
  };
}

export const PLAYSTYLE_ACADEMY_CONFIG = createPlayStyleAcademyConfig(
  snapshot as RawSnapshot,
);
