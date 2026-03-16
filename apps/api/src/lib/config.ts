export const config = {
  port: parseInt(process.env.HELM_API_PORT ?? "3000", 10),
  dataDir: process.env.HELM_DATA_DIR ?? "",
  boardToken: process.env.HELM_BOARD_TOKEN ?? "",
};
