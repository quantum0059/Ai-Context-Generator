import { suggestForCategory } from "./src/contextforge/suggestions";
import { config } from "dotenv";

config();

async function main() {
  try {
    const draft = {
      projectName: "Test",
      description: "A simple e-commerce website with a shopping cart and checkout process.",
      platform: "web",
      features: ["Shopping Cart", "Checkout"],
      constraints: { budget: undefined, avoid: [] },
      projectType: "Full-Stack Web Application",
      classificationReason: "Standard web app",
    };
    const res = await suggestForCategory("frontendFramework", draft);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err);
  }
}
main();
