const fs = require("fs-extra");
const https = require("https");
const path = require("path");

const FILE_NAME = "ViGEmBus_1.22.0_x64_x86_arm64.exe";
const URL = `https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/${FILE_NAME}`;
const DEST = path.resolve(__dirname, "..", "tools", "ViGEmBus", FILE_NAME);

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { Accept: "application/octet-stream" } }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error("Redirection sans URL"));
            return;
          }
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        try {
          fs.unlinkSync(dest);
        } catch {}
        reject(err);
      });
  });
}

async function main() {
  await fs.ensureDir(path.dirname(DEST));
  if (await fs.pathExists(DEST)) {
    console.log(`[download-vigem-driver] Deja present : ${DEST}`);
    return;
  }
  console.log(`[download-vigem-driver] Telechargement de ${URL}...`);
  await downloadFile(URL, DEST);
  console.log(`[download-vigem-driver] Sauvegarde : ${DEST}`);
}

main().catch((err) => {
  console.error("[download-vigem-driver] Erreur :", err);
  process.exit(1);
});
