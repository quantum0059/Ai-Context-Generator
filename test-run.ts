import { config } from "dotenv";
config();
import { extractArchitecturalRequirements } from "./src/contextforge/requirement-extractor";

async function main() {
  try {
    const desc = "A full-stack real-time messaging application that combines private messaging, group chats, and admin-controlled broadcast channels in a single platform. Users can securely register and log in, chat one-on-one, create and manage group conversations, and share media in real time. The platform's standout feature is its broadcast system, where administrators can create announcement channels, add specific users, and instantly deliver messages to all members simultaneously while preventing members from posting. Built with a scalable architecture using Spring Boot, PostgreSQL, JWT authentication, WebSockets, and a modern React Native frontend, the application is designed for organizations, educational institutions, businesses, and communities that require secure, fast, and reliable communication.";
    const result = await extractArchitecturalRequirements(desc, "web", "TestProject");
    console.log("SUCCESS. Features generated:", result.functional.length);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
main();
