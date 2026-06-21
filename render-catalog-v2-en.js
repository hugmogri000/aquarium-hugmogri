const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = __dirname;
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = Number(process.env.PORT || 9223);
const serverPort = Number(process.env.CATALOG_PORT || 4191);
const userDataDir = path.join(root, ".chrome-render-profile");
const panelDir = path.join(root, "catalog-panels-v2-en");

const outputs = [
  ["01-cover", "01-cover-en.png"],
  ["02-overview", "02-overview-en.png"],
  ["03-exploded", "03-exploded-view-en.png"],
  ["04-components", "04-components-en.png"],
  ["05-options", "05-options-en.png"],
  ["06-dimensions", "06-dimensions-en.png"],
  ["07-scenes", "07-application-en.png"],
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const requested = decodeURIComponent(url.pathname === "/" ? "/catalog-v2.html" : url.pathname);
    const filePath = path.resolve(root, `.${requested}`);

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(serverPort, "127.0.0.1", () => resolve(server));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForChrome() {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  for (let i = 0; i < 80; i += 1) {
    try {
      return await requestJson(versionUrl);
    } catch {
      await delay(150);
    }
  }
  throw new Error("Chrome did not expose the debugging endpoint.");
}

function connectWebSocket(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
    }
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const messageId = ++id;
          socket.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((res, rej) => {
            pending.set(messageId, { resolve: res, reject: rej });
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("error", reject);
  });
}

async function createPage() {
  const page = await requestJson(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:${serverPort}/catalog-v2.html`, "PUT");
  return connectWebSocket(page.webSocketDebuggerUrl);
}

async function waitForPage(client) {
  await client.send("Page.enable");
  await client.send("DOM.enable");
  await client.send("Runtime.enable");
  await client.send("Page.navigate", { url: `http://127.0.0.1:${serverPort}/catalog-v2.html` });

  for (let i = 0; i < 120; i += 1) {
    const result = await client.send("Runtime.evaluate", {
      expression: `document.readyState === "complete" && Array.from(document.images).every((img) => img.complete) && document.fonts.status === "loaded"`,
      returnByValue: true,
    });
    if (result.result && result.result.value) break;
    await delay(100);
  }

  await delay(350);
}

async function getPanels(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: `Array.from(document.querySelectorAll(".panel")).map((panel) => {
      const rect = panel.getBoundingClientRect();
      return {
        name: panel.dataset.panel,
        x: rect.x,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height
      };
    })`,
    returnByValue: true,
  });
  return result.result.value;
}

async function screenshotPanel(client, panel, filename) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: Math.ceil(panel.height),
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Runtime.evaluate", {
    expression: `window.scrollTo(0, ${Math.floor(panel.y)});`,
    returnByValue: true,
  });
  await delay(100);
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      scale: 1,
    },
  });
  fs.writeFileSync(path.join(panelDir, filename), Buffer.from(shot.data, "base64"));
}

async function writeLongImage(client) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 11500,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Runtime.evaluate", {
    expression: "window.scrollTo(0, 0);",
    returnByValue: true,
  });
  await delay(120);
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: 1200,
      height: 11500,
      scale: 1,
    },
  });
  fs.writeFileSync(path.join(root, "eco-bucket-aquarium-catalog-en-long.png"), Buffer.from(shot.data, "base64"));
}

async function writePdf(client) {
  const pdfHtml = path.join(root, "__catalog-pdf-pages.html");
  const pages = outputs.map(([, filename]) => (
    `<section><img src="./catalog-panels-v2-en/${filename}" alt=""></section>`
  )).join("\n");
  fs.writeFileSync(pdfHtml, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: 8.5in 11in; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    section {
      width: 8.5in;
      height: 11in;
      page-break-after: always;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #fff;
    }
    section:last-child { page-break-after: auto; }
    img { width: 100%; height: 100%; object-fit: contain; display: block; }
  </style>
</head>
<body>
${pages}
</body>
</html>
`, "utf8");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 1500,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Runtime.evaluate", {
    expression: `location.href = "http://127.0.0.1:${serverPort}/__catalog-pdf-pages.html";`,
    returnByValue: true,
  });
  for (let i = 0; i < 120; i += 1) {
    const result = await client.send("Runtime.evaluate", {
      expression: `document.readyState === "complete" && Array.from(document.images).every((img) => img.complete)`,
      returnByValue: true,
    });
    if (result.result && result.result.value) break;
    await delay(100);
  }
  await delay(200);
  const pdf = await client.send("Page.printToPDF", {
    printBackground: true,
    preferCSSPageSize: true,
    paperWidth: 8.5,
    paperHeight: 11,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    scale: 1,
  });
  fs.writeFileSync(path.join(root, "eco-bucket-aquarium-catalog-en.pdf"), Buffer.from(pdf.data, "base64"));
  fs.rmSync(pdfHtml, { force: true });
}

async function main() {
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome not found: ${chromePath}`);
  }
  fs.mkdirSync(panelDir, { recursive: true });

  const server = await serve();
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitForChrome();
    const client = await createPage();
    try {
      await waitForPage(client);
      const panels = await getPanels(client);
      for (const [name, filename] of outputs) {
        const panel = panels.find((item) => item.name === name);
        if (!panel) throw new Error(`Panel not found: ${name}`);
        await screenshotPanel(client, panel, filename);
        console.log(`wrote ${path.join("catalog-panels-v2-en", filename)}`);
      }
      await writeLongImage(client);
      console.log("wrote eco-bucket-aquarium-catalog-en-long.png");
      await writePdf(client);
      console.log("wrote eco-bucket-aquarium-catalog-en.pdf");
    } finally {
      client.close();
    }
  } finally {
    server.close();
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
