"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { useWizard } from "../wizard-context";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";
import { Button } from "@/components/ui/button";

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function DesignPage() {
  const { state, updateState } = useWizard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadImages(selected: FileList | null) {
    if (!selected?.length) return;
    setError(null);

    const remaining = MAX_IMAGES - state.designReferenceImages.length;
    if (remaining <= 0) {
      setError(`You can add up to ${MAX_IMAGES} reference images.`);
      return;
    }

    const files = Array.from(selected);
    if (files.length > remaining) {
      setError(`Select at most ${remaining} more image${remaining === 1 ? "" : "s"}.`);
      return;
    }
    const invalid = files.find((file) => !ACCEPTED_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE);
    if (invalid) {
      setError(`${invalid.name} must be a JPG, PNG, WebP, or GIF no larger than 5MB.`);
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      const response = await fetch("/api/contextforge/upload", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Image upload failed.");

      const uploadedUrls = (data.images as Array<{ url: string }>).map((image) => image.url);
      updateState({
        designReferenceImages: Array.from(new Set([
          ...state.designReferenceImages,
          ...uploadedUrls,
        ])).slice(0, MAX_IMAGES),
      });
      if (data.errors?.length) setError(data.errors.join(" "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeImage(url: string) {
    updateState({
      designReferenceImages: state.designReferenceImages.filter((image) => image !== url),
    });
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={5} />

      <main className="mx-auto max-w-[760px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">Design References</h1>
          <p className="mx-auto mt-3 max-w-[520px] text-sm text-[#888]">
            Upload screenshots and add notes or URLs to guide the visual direction.
          </p>
        </div>

        <div className="mt-8 space-y-6 rounded-xl border border-white/[0.08] bg-[#111111] p-6">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="block text-sm font-medium text-white">Reference images</label>
                <p className="mt-1 text-xs text-[#666]">Up to 10 images · JPG, PNG, WebP, or GIF · 5MB each</p>
              </div>
              <span className="text-xs text-[#888]">{state.designReferenceImages.length}/{MAX_IMAGES}</span>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={(event) => uploadImages(event.target.files)}
            />

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || state.designReferenceImages.length >= MAX_IMAGES}
              className="mt-4 flex min-h-28 w-full flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.14] bg-[#171717] px-4 text-center transition-colors hover:border-white/25 hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="size-5 animate-spin text-[#aaa]" />
                  <span className="mt-2 text-sm text-[#aaa]">Uploading to Cloudinary…</span>
                </>
              ) : (
                <>
                  <ImagePlus className="size-5 text-[#aaa]" />
                  <span className="mt-2 text-sm text-white">Choose reference images</span>
                  <span className="mt-1 text-xs text-[#666]">Select several images at once</span>
                </>
              )}
            </button>

            {error && (
              <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            {state.designReferenceImages.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {state.designReferenceImages.map((url, index) => (
                  <div key={url} className="group relative overflow-hidden rounded-lg border border-white/[0.08] bg-black">
                    <img
                      src={url}
                      alt={`Design reference ${index + 1}`}
                      className="aspect-square h-full w-full object-cover"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      aria-label={`Remove design reference ${index + 1}`}
                      onClick={() => removeImage(url)}
                      className="absolute right-1.5 top-1.5 size-7 rounded-full bg-black/75 text-white opacity-100 hover:bg-black sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">Notes and URLs</label>
            <textarea
              rows={5}
              placeholder="https://example.com, rounded UI, muted colors, compact dashboard…"
              value={state.designReferences}
              onChange={(event) => updateState({ designReferences: event.target.value })}
              className="w-full rounded-lg border border-white/[0.10] bg-[#1A1A1A] px-3 py-2 text-sm text-white placeholder:text-[#555] outline-none focus:border-white/[0.20]"
            />
          </div>
        </div>
      </main>

      <WizardBottomNav
        backHref="/new-project/continuous"
        continueHref="/new-project/review"
        continueDisabled={uploading}
      />
    </div>
  );
}
