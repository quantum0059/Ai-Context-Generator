import type { ProjectSpec } from "@/types/projectspec";

export interface Template {
  id: string;
  name: string;
  description: string;
  spec: ProjectSpec;
}

export const TEMPLATES: Template[] = [
  {
    id: "saas-starter",
    name: "SaaS Starter Template",
    description: "A complete SaaS project setup with Next.js, Clerk Auth, Stripe subscriptions, and a Supabase database.",
    spec: {
      id: "saas-starter-spec",
      projectName: "SaaS Starter App",
      description: "A comprehensive SaaS application featuring user accounts, tiered subscription billing, an admin dashboard, and user activity metrics.",
      platform: "web",
      features: [
        "User Onboarding",
        "Subscription Management",
        "Interactive Dashboard",
        "Settings Panel",
        "Admin Portal"
      ],
      requiredCategories: [
        "frontend-framework",
        "authentication",
        "database",
        "state-management",
        "ai-provider",
        "payments"
      ],
      stack: {
        "frontend-framework": { value: "Next.js", source: "user", confidence: "high" },
        "authentication": { value: "Clerk", source: "user", confidence: "high" },
        "database": { value: "Supabase (PostgreSQL)", source: "user", confidence: "high" },
        "state-management": { value: "Zustand", source: "user", confidence: "high" },
        "ai-provider": { value: "Google Gemini", source: "user", confidence: "high" },
        "payments": { value: "Stripe", source: "user", confidence: "high" }
      },
      constraints: {
        budget: "Under $50/month",
        avoid: ["Firebase", "Redux"]
      },
      designReferences: [
        "Modern dark-mode aesthetic with tailwind css",
        "Clean, simple dashboard layout similar to Vercel"
      ],
      projectSpecVersion: "1.0.0"
    }
  },
  {
    id: "mobile-commerce",
    name: "Mobile Commerce App Template",
    description: "A cross-platform mobile commerce application built on Expo, Supabase DB, and Stripe mobile payments.",
    spec: {
      id: "mobile-commerce-spec",
      projectName: "Mobile Commerce App",
      description: "An elegant cross-platform mobile shopping application with product catalogs, shopping cart, secure checkout, and order history.",
      platform: "mobile-ios-android",
      features: [
        "Product Catalog",
        "Shopping Cart & Checkout",
        "User Authentication",
        "Push Notifications",
        "Order History"
      ],
      requiredCategories: [
        "frontend-framework",
        "authentication",
        "database",
        "state-management",
        "ai-provider",
        "payments"
      ],
      stack: {
        "frontend-framework": { value: "Expo (React Native)", source: "user", confidence: "high" },
        "authentication": { value: "OAuth", source: "user", confidence: "high" },
        "database": { value: "Supabase (PostgreSQL)", source: "user", confidence: "high" },
        "state-management": { value: "Zustand", source: "user", confidence: "high" },
        "ai-provider": { value: "OpenAI", source: "user", confidence: "high" },
        "payments": { value: "Stripe", source: "user", confidence: "high" }
      },
      constraints: {
        budget: "Free tier prioritized",
        avoid: ["Realm", "MongoDB"]
      },
      designReferences: [
        "Minimalist mobile UI with smooth transitions",
        "Apple-inspired checkout flows"
      ],
      projectSpecVersion: "1.0.0"
    }
  },
  {
    id: "ai-agent-platform",
    name: "AI Agent Platform Template",
    description: "Build agentic applications with Next.js, Anthropic's Claude, and Neon serverless database.",
    spec: {
      id: "ai-agent-platform-spec",
      projectName: "AI Agent Platform",
      description: "A state-of-the-art AI assistant platform for automated workflows, structured agent tools, and database memory integration.",
      platform: "web",
      features: [
        "Agent Chat Interface",
        "Long-term DB Memory",
        "Tool Calling & Execution",
        "Prompt Template Library",
        "Analytics Dashboard"
      ],
      requiredCategories: [
        "frontend-framework",
        "authentication",
        "database",
        "state-management",
        "ai-provider",
        "payments"
      ],
      stack: {
        "frontend-framework": { value: "Next.js", source: "user", confidence: "high" },
        "authentication": { value: "Clerk", source: "user", confidence: "high" },
        "database": { value: "Neon", source: "user", confidence: "high" },
        "state-management": { value: "TanStack Query", source: "user", confidence: "high" },
        "ai-provider": { value: "Anthropic", source: "user", confidence: "high" },
        "payments": { value: "Lemon Squeezy", source: "user", confidence: "high" }
      },
      constraints: {
        budget: "Pay-as-you-go, flexible",
        avoid: ["MongoDB", "Redux"]
      },
      designReferences: [
        "Futuristic cyber-grid interface",
        "Dark-mode console terminal theme"
      ],
      projectSpecVersion: "1.0.0"
    }
  }
];
