export interface ServerConfig {
  url: string;
  token: string;
}
export function isLocalServer(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  const parts = hostname.split(".");
  if (
    parts.length !== 4 ||
    parts.some((p) => !/^\d+$/.test(p) || Number(p) > 255)
  )
    return false;
  const [a, b] = parts.map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}
export function validateServerConfig(value: ServerConfig): ServerConfig {
  let url: URL;
  try {
    url = new URL(value.url.trim());
  } catch {
    throw new Error("SERVER_URL_INVALID");
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error("SERVER_URL_INVALID");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLocalServer(url.hostname))
  )
    throw new Error("SERVER_HTTPS_REQUIRED");
  const token = value.token.trim();
  if (
    token &&
    (token.length < 32 || token.length > 2048 || /[\r\n]/.test(token))
  )
    throw new Error("SERVER_TOKEN_INVALID");
  return { url: url.toString().replace(/\/+$/, ""), token };
}
