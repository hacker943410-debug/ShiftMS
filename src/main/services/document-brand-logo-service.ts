import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

const resolveBrandLogoBuffer = () => {
  const candidatePaths = [
    path.resolve(__dirname, "../../../dist/assets/brand-logo-clean.png"),
    path.resolve(__dirname, "../../../src/renderer/assets/brand-logo-clean.png"),
    path.resolve(process.cwd(), "dist", "assets", "brand-logo-clean.png"),
    path.resolve(process.cwd(), "src", "renderer", "assets", "brand-logo-clean.png"),
    path.resolve(__dirname, "../../../dist/assets"),
    path.resolve(__dirname, "../../../src/renderer/assets"),
    path.resolve(process.cwd(), "dist", "assets"),
    path.resolve(process.cwd(), "src", "renderer", "assets")
  ];

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    if (candidatePath.endsWith(".png")) {
      return readFileSync(candidatePath);
    }

    const logoFileName = readdirSync(candidatePath).find((fileName) =>
      /^brand-logo-clean.*\.png$/i.test(fileName)
    );

    if (logoFileName) {
      return readFileSync(path.resolve(candidatePath, logoFileName));
    }
  }

  return null;
};

export const applyWorkbookBrandLogo = (workbook: ExcelJS.Workbook) => {
  const logoBuffer = resolveBrandLogoBuffer();

  if (!logoBuffer) {
    return false;
  }

  const imageIds = new Set<number>();
  workbook.worksheets.forEach((worksheet) => {
    worksheet.getImages().forEach((image) => {
      const imageId = Number(image.imageId);

      if (Number.isFinite(imageId)) {
        imageIds.add(imageId);
      }
    });
  });

  const media = workbook.model.media ?? [];
  imageIds.forEach((imageId) => {
    const image = media[imageId];

    if (!image || image.type !== "image") {
      return;
    }

    const mutableImage = image as unknown as {
      buffer: unknown;
      extension: string;
      type: string;
    };

    mutableImage.buffer = logoBuffer;
    mutableImage.extension = "png";
  });

  return imageIds.size > 0;
};
