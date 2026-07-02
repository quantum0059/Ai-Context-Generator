import { extractArchitecturalRequirements } from "./src/contextforge/requirement-extractor";
import { config } from "dotenv";
config();

async function run() {
  const desc = "An AI-powered image generation platform that transforms text prompts into stunning, high-quality images using state-of-the-art generative AI models. The application enables users to create artwork, illustrations, logos, concept art, product designs, realistic photos, and digital content through natural language descriptions. It offers advanced editing capabilities such as image-to-image generation, inpainting, outpainting, background removal, upscaling, and AI-powered enhancements. Users can explore multiple artistic styles, customize generation settings, organize their creations in a personal gallery, share work with the community, and seamlessly create professional-quality visuals for creative, personal, and commercial use. The platform supports multiple AI models, secure cloud storage, cross-device synchronization, and a modern, intuitive interface designed for both beginners and professionals.";
  try {
    const res = await extractArchitecturalRequirements(desc, "Web App", "AI Image Gen");
    console.log("Success! Functional requirements:");
    console.log(res.functional.map(f => f.title));
  } catch (err) {
    console.error("Failed:", err);
  }
}

run();
