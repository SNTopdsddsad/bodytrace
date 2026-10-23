/**
 * 饮食照片的服务端处理：只信任 sharp 解码出的真实格式。
 *
 * 统一转成 WebP 可以顺带去掉 EXIF/GPS、应用拍摄方向，并生成列表用缩略图。
 * 限制像素数是为了避免超大图片在解码阶段耗尽内存。
 */
import sharp from "sharp";

const MAX_INPUT_PIXELS = 40_000_000;
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type ProcessedMealPhoto = {
  main: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  byteSize: number;
  mimeType: "image/webp";
};

export class MealPhotoImageError extends Error {
  readonly code: "invalid" | "unsupported";

  constructor(message: string, code: "invalid" | "unsupported") {
    super(message);
    this.name = "MealPhotoImageError";
    this.code = code;
  }
}

export async function processMealPhoto(input: Buffer): Promise<ProcessedMealPhoto> {
  try {
    const image = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
      animated: false,
    });
    const metadata = await image.metadata();
    // sharp 将 AVIF 识别为 HEIF 容器 + AV1；不能顺带放行 HEVC 编码的 HEIC。
    const isAvif = metadata.format === "heif" && metadata.compression === "av1";
    if (!isAvif && (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format))) {
      throw new MealPhotoImageError("只支持 JPG、PNG、WebP 或 AVIF 图片", "unsupported");
    }

    const pipeline = image.rotate();
    const [main, thumb] = await Promise.all([
      pipeline
        .clone()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true }),
      pipeline
        .clone()
        .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer({ resolveWithObject: true }),
    ]);

    return {
      main: main.data,
      thumb: thumb.data,
      width: main.info.width,
      height: main.info.height,
      byteSize: main.data.length,
      mimeType: "image/webp",
    };
  } catch (error) {
    if (error instanceof MealPhotoImageError) throw error;
    throw new MealPhotoImageError("无法读取这张照片，请换一张再试", "invalid");
  }
}
