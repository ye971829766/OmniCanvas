/**
 * Sanitize provider / channel errors before they reach the client UI.
 * Full technical detail should only be logged server-side.
 */

export function userFacingGenerationError(
  err: unknown,
  fallback = "生成失败，请稍后重试",
): string {
  let raw = "";
  if (typeof err === "string") {
    raw = err;
  } else if (err && typeof err === "object") {
    const anyErr = err as any;
    if (typeof anyErr.message === "string") raw = anyErr.message;
    else if (typeof anyErr.error === "string") raw = anyErr.error;
  }
  raw = raw.trim();
  if (!raw) return fallback;

  if (
    /excessive system load|system load|overloaded|capacity|too many requests|rate.?limit|429|繁忙|拥挤|负载过高|超负荷/i.test(
      raw,
    )
  ) {
    return "服务繁忙，请稍后重试";
  }
  if (/timeout|timed?\s*out|deadline|超时/i.test(raw)) {
    return "生成超时，请稍后重试";
  }
  if (/content.?policy|safety|nsfw|moderation|违规|敏感|审核/i.test(raw)) {
    return "内容未通过安全审核，请修改描述后重试";
  }
  if (/insufficient|quota|balance|积分不足|余额不足|402/i.test(raw)) {
    return "积分不足，请充值后继续";
  }
  if (
    /unauthorized|forbidden|invalid.?api.?key|401|403|未配置.*渠道|没有可用/i.test(
      raw,
    )
  ) {
    return "服务暂时不可用，请稍后重试或联系管理员";
  }
  if (
    /\[Channel\s+|providerErrors?|upstream|ECONN|ENOTFOUND|socket|TLS|certificate|HTTP\s*\d{3}/i.test(
      raw,
    )
  ) {
    return fallback;
  }

  // Keep short Chinese product copy only.
  if (
    /[\u4e00-\u9fff]/.test(raw) &&
    raw.length <= 80 &&
    !/[A-Za-z]{12,}/.test(raw)
  ) {
    return raw;
  }

  return fallback;
}
