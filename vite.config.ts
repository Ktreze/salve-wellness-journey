import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { deflateRawSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

const EXTENSION_DIRECTORY = "extension/okai-instagram-scanner";
const EXTENSION_ARCHIVE_NAME = "okai-instagram-scanner.zip";
const EXTENSION_FILES = ["manifest.json", "content.js", "popup.html"];

function crc32(content: Buffer) {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function createZip(files: Array<{ name: string; content: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateRawSync(file.content, { level: 9 });
    const checksum = crc32(file.content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(file.content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(file.content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildExtensionArchive() {
  const sourceFiles = listFiles(EXTENSION_DIRECTORY);
  const requiredFiles = EXTENSION_FILES.map((name) => join(EXTENSION_DIRECTORY, name));
  const missingFiles = requiredFiles.filter((path) => !sourceFiles.includes(path));

  if (missingFiles.length) {
    throw new Error(`Arquivos obrigatórios da extensão ausentes: ${missingFiles.map((path) => relative(process.cwd(), path)).join(", ")}`);
  }

  const files = sourceFiles.map((path) => ({
    name: `okai-instagram-scanner/${relative(EXTENSION_DIRECTORY, path).split(sep).join("/")}`,
    content: readFileSync(path)
  }));

  return createZip(files);
}

function chromeExtensionExport(): Plugin {
  return {
    name: "okai-instagram-scanner-export",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== `/${EXTENSION_ARCHIVE_NAME}`) {
          next();
          return;
        }

        try {
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/zip");
          response.setHeader("Content-Disposition", `attachment; filename="${EXTENSION_ARCHIVE_NAME}"`);
          response.end(buildExtensionArchive());
        } catch (error) {
          next(error);
        }
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: EXTENSION_ARCHIVE_NAME,
        source: buildExtensionArchive()
      });
    }
  };
}

export default defineConfig({
  plugins: [chromeExtensionExport()],
  tanstackStart: {
    // Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
    // CompressionStream) or set content-encoding here — the body gets encoded twice and renders garbled.
    nitro: { preset: "node-server" }
  }
});
