// whatsapp-web.js drives the island's own Electron/Chromium over CDP, so
// Puppeteer never needs to download a browser of its own.
module.exports = { skipDownload: true }
