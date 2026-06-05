const { definePlugin } = require("@realtimex/plugin-sdk");
const metadata = require("./plugin-metadata.json");
const {
  ensureGatewayProcess,
  stopGatewayProcess,
  getDashboardPayload,
  getLaunchContextPayload,
} = require("./runtime.js");

module.exports = definePlugin({
  id: metadata.plugin.manifestId,

  async register(api) {
    api.registerRoute("GET", metadata.contract.route, async (_request, response) => {
      const dashboard = await getDashboardPayload({ api, pluginDir: __dirname });
      return response.status(200).json(dashboard);
    });
    api.registerRoute("POST", "/launch-context", async (request, response) => {
      const payload = await getLaunchContextPayload({ api, request });
      return response.status(200).json(payload);
    });
  },

  async activate(api) {
    await ensureGatewayProcess({ api, pluginDir: __dirname });
  },

  async deactivate(api) {
    await stopGatewayProcess({ api });
  },
});
