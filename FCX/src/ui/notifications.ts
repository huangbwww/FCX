const EXACT_MESSAGES: Record<string, string> = {
  "SBC Stopped": "SBC任务已停止",
  "SBC not available": "该SBC当前不可用",
  "Failed to submit": "SBC提交失败",
  "SBC Submitted": "SBC提交成功",
  "Failed to save squad.": "阵容保存失败",
  "No cached price available": "没有可用的缓存价格",
  "No active listing found": "没有找到有效挂牌",
  "Quick buy failed": "快速购买失败",
  "Quick buy encountered an error": "快速购买发生错误",
  "Quick buy squad encountered an error": "整套阵容快速购买发生错误",
  "No concept players found in the current squad.": "当前阵容中没有概念球员",
  "Price refreshed": "价格已刷新",
  "Item unlocked": "球员已解锁",
  "Item locked": "球员已锁定",
  "Removed Must Use": "已取消必须使用",
  "Must Use Set": "已设为必须使用",
  "Collected All Concept Players": "概念球员已收集完成",
  "Please check backend API is running": "请确认后端服务正在运行",
  "Still Collecting Concept Players, They will not be used for this solution":
    "概念球员仍在收集中，本次方案不会使用概念球员",
};

const REPLACEMENTS: Array<[RegExp, (...parts: string[]) => string]> = [
  [/^(\d+) Completed$/, (count) => `已完成 ${count} 次`],
  [/^(\d+) \/ (\d+) Completed$/, (done, total) => `已完成 ${done} / ${total}`],
  [/^Opening Pack: (.+)$/, (name) => `正在打开卡包：${name}`],
  [/^(.+) SBC Started(?: \((\d+)\/(\d+)\))?$/, (name, done, total) =>
    done && total ? `${name} 已开始（${done}/${total}）` : `${name} 已开始`],
  [/^Trying another challenge: (.+)$/, (name) => `正在尝试其他挑战：${name}`],
  [/^All uncompleted challenges in "(.+)" have been tried$/, (name) =>
    `“${name}”中的未完成挑战均已尝试`],
  [/^Error code: (.+)$/, (code) => `错误代码：${code}`],
  [/^Price refreshed: (.+)$/, (price) => `价格已刷新：${price}`],
  [/^(.+) appears to be extinct$/, (name) => `${name} 当前可能已绝版`],
  [/^Quick buy success at (.+)$/, (price) => `快速购买成功，价格 ${price}`],
  [/^Quick buy attempted at (.+)$/, (price) => `已尝试快速购买，价格 ${price}`],
  [/^Quick buy squad complete: (\d+)\/(\d+) players purchased$/, (done, total) =>
    `整套阵容快速购买完成：成功 ${done} / ${total}`],
  [/^Lowest listing \((.+)\) exceeds expected price \((.+)\)$/, (lowest, expected) =>
    `最低挂牌价（${lowest}）高于预期价格（${expected}）`],
];

export function localizeFcxNotification(message: unknown): string {
  const raw = String(message ?? "").trim();
  if (!raw) return "FCX操作已完成";
  const exact = EXACT_MESSAGES[raw];
  if (exact) return exact;
  for (const [pattern, formatter] of REPLACEMENTS) {
    const match = raw.match(pattern);
    if (match) return formatter(...match.slice(1));
  }
  return raw;
}

export function localizeSolverStatus(statusCode: number): string {
  const messages: Record<number, string> = {
    0: "未能确定求解结果：已达到搜索限制",
    1: "求解模型无效",
    2: "已找到可行方案，但尚未证明为最优方案",
    3: "没有找到可行方案",
    4: "已找到最优方案",
  };
  return messages[statusCode] ?? `求解结束，状态代码：${statusCode}`;
}
