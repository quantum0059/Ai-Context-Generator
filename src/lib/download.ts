import JSZip from "jszip";

export async function downloadZip(files: Record<string, string>, projectName: string = "project") {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(`project-package/${path}`, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-context-package.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
