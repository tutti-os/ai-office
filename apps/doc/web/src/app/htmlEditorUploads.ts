import { uploadProjectAsset } from "../api/projects";
import { htmlProjectAssetRuntimeUrl } from "../artifact/runtime/projectAssets";
import { imageAltFromFileName } from "./htmlImageDom";
import type { ImageAttributes } from "./runtimeWorkbenchTypes";

export async function uploadHtmlEditorImageFileAsset(input: {
  artifactReadOnly: boolean;
  currentProjectId: string;
  file: File;
  onError: (message: string) => void;
}): Promise<ImageAttributes> {
  try {
    if (input.artifactReadOnly) throw new Error("Document is read only.");
    if (!input.file.type.startsWith("image/")) throw new Error("Please choose an image file.");
    if (!input.currentProjectId) throw new Error("Project is not open.");
    const asset = await uploadProjectAsset(input.currentProjectId, input.file);
    return {
      src: htmlProjectAssetRuntimeUrl(input.currentProjectId, asset.fileName),
      alt: imageAltFromFileName(input.file.name),
      width: "",
      height: "",
    };
  } catch (err) {
    input.onError(err instanceof Error ? err.message : String(err));
    throw err;
  }
}
