export const config = {
  port: parseInt(process.env.HELM_API_PORT ?? "3000", 10),
  dataDir: process.env.HELM_DATA_DIR ?? "",
  boardToken: process.env.HELM_BOARD_TOKEN ?? "",
  agentToken: process.env.HELM_AGENT_TOKEN ?? "",
  maxBodyBytes: parseInt(process.env.HELM_MAX_BODY_BYTES ?? "65536", 10),
  webOrigins: (process.env.HELM_WEB_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
};
