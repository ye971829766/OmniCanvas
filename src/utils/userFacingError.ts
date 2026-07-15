/**
 * Map raw API / runtime errors to short Chinese copy for end users.
 * Technical details stay in console only.
 */

const USER_SAFE_PREFIXES = [
  "用户名",
  "密码",
  "账号",
  "积分",
  "登录",
  "注册",
  "权限",
  "未提供",
  "无效",
  "请",
  "操作过于频繁",
  "网络不允许",
  "已被封禁",
  "封禁",
  "不存在",
  "已存在",
  "不能为空",
  "至少",
  "失败",
  "成功",
  "Token",
  "token",
  "Google",
  "支付",
  "订单",
  "配置",
  "文件",
  "图片",
  "视频",
  "生成",
  "余额",
  "上传",
  "服务",
  "模型",
  "渠道",
  "任务",
];

const TECH_MARKERS = [
  /cannot read propert/i,
  /undefined is not/i,
  /is not a function/i,
  /unexpected token/i,
  /json\.parse/i,
  /econnrefused/i,
  /enotfound/i,
  /etimedout/i,
  /sqlite/i,
  /sql /i,
  /stack/i,
  /at\s+\S+\s+\(/i,
  /aes-?gcm/i,
  /ciphertext/i,
  /envelope/i,
  /internal server/i,
  /nestjs/i,
  /typeerror/i,
  /referenceerror/i,
  /network error/i,
  /failed to fetch/i,
  /decrypt/i,
  /encrypt/i,
  /ECONNRESET/i,
  /status code/i,
  /\[Channel\s+/i,
  /providerErrors?/i,
  /upstream/i,
  /base_?url/i,
  /api[_ -]?key/i,
  /traceback/i,
  /exception/i,
];

function extractRawMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  const anyErr = err as any;
  const data = anyErr?.response?.data;
  if (data) {
    if (typeof data === "string") return data;
    if (typeof data.message === "string") return data.message;
    if (Array.isArray(data.message)) return data.message.filter(Boolean).join("；");
    if (typeof data.error === "string") return data.error;
    if (typeof data.error === "object" && data.error?.message) {
      return String(data.error.message);
    }
    // Prefer a single public error; never surface providerErrors arrays as-is.
    if (Array.isArray(data.providerErrors) && data.providerErrors.length > 0) {
      return String(data.providerErrors[0]);
    }
  }
  if (typeof anyErr?.message === "string") return anyErr.message;
  return "";
}

function isUserSafeMessage(msg: string): boolean {
  const t = msg.trim();
  if (!t || t.length > 120) return false;
  if (TECH_MARKERS.some((re) => re.test(t))) return false;
  // Prefer Chinese product copy or short known phrases
  if (/[\u4e00-\u9fff]/.test(t)) {
    return !/[A-Za-z]{12,}/.test(t); // long English identifiers look technical
  }
  return USER_SAFE_PREFIXES.some((p) => t.startsWith(p) || t.includes(p));
}

/**
 * Map generation / channel / upstream failures to short product copy.
 * Never show channel names, provider dumps, or English infra jargon in the UI.
 */
export function userFacingGenerationError(
  err: unknown,
  fallback = "生成失败，请稍后重试",
): string {
  const raw = extractRawMessage(err).trim();
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
  if (
    /content.?policy|safety|nsfw|moderation|违规|敏感|审核/i.test(raw)
  ) {
    return "内容未通过安全审核，请修改描述后重试";
  }
  if (
    /insufficient|quota|balance|积分不足|余额不足|402/i.test(raw)
  ) {
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

  if (isUserSafeMessage(raw)) return raw;
  return fallback;
}

export function userFacingError(
  err: unknown,
  fallback = "操作失败，请稍后重试",
): string {
  const status = Number((err as any)?.response?.status || 0);
  const raw = extractRawMessage(err).trim();

  // Generation / channel style payloads (even without HTTP status)
  if (
    /\[Channel\s+/i.test(raw) ||
    /providerErrors?/i.test(raw) ||
    /excessive system load/i.test(raw)
  ) {
    return userFacingGenerationError(err, "生成失败，请稍后重试");
  }

  if (status === 429) return "操作过于频繁，请稍后再试";
  if (status === 401) {
    if (raw && /封禁|banned/i.test(raw)) return "账号已被封禁，如有疑问请联系管理员";
    if (raw && isUserSafeMessage(raw)) return raw;
    return "登录已失效，请重新登录";
  }
  if (status === 402) return "积分不足，请充值后继续";
  if (status === 403) {
    if (raw && isUserSafeMessage(raw)) return raw;
    return "没有权限执行此操作";
  }
  if (status === 404) return "请求的内容不存在或已删除";
  if (status === 409) {
    if (raw && isUserSafeMessage(raw)) return raw;
    return "操作冲突，请刷新后重试";
  }
  if (status === 413) return "上传内容过大，请压缩后重试";
  if (status >= 500 || status === 502 || status === 503 || status === 504) {
    return userFacingGenerationError(err, "服务暂时不可用，请稍后再试");
  }

  if (raw && isUserSafeMessage(raw)) return raw;

  // Network layer without response
  if ((err as any)?.code === "ERR_NETWORK" || /network error/i.test(raw)) {
    return "网络异常，请检查连接后重试";
  }

  return fallback;
}

/** Log technical error privately, return safe copy for UI. */
export function reportAndFaceError(
  err: unknown,
  fallback = "操作失败，请稍后重试",
  context?: string,
): string {
  if (context) console.error(`[${context}]`, err);
  else console.error(err);
  return userFacingError(err, fallback);
}
