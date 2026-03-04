// CRA Dev Server Proxy
// Forwards all /api requests to the Express backend at port 8080.
// This bypasses webpack-dev-server's internal body size limit, allowing
// large CSV uploads (up to the 10mb limit set in Express) to pass through.

const { createProxyMiddleware } = require('http-proxy-middleware')

module.exports = function (app) {
    app.use(
        '/api',
        createProxyMiddleware({
            target: 'http://localhost:8080',
            changeOrigin: true,
        })
    )
}
