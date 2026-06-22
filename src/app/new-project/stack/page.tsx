"use client";

import { useState } from "react";
import {
  Box,
  Cpu,
  CreditCard,
  Database,
  LayoutGrid,
  Lock,
} from "lucide-react";

import { useWizard } from "../wizard-context";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { StackCategoryRow } from "@/components/wizard/stack-category-row";
import {
  SuggestDialog,
  type SuggestionOption,
} from "@/components/wizard/suggest-dialog";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";

const MOCK_SUGGESTIONS: Record<string, SuggestionOption[]> = {
  Authentication: [
    {
      name: "Clerk",
      rationale: "Fast setup with hosted UI and social login for web apps.",
    },
    {
      name: "Auth.js",
      rationale: "Flexible open-source auth with many provider adapters.",
    },
    {
      name: "Supabase Auth",
      rationale: "Built-in auth if you are already using Supabase.",
    },
  ],
  Database: [
    {
      name: "PlanetScale",
      rationale: "Serverless MySQL with branching for rapid iteration.",
    },
    {
      name: "Neon",
      rationale: "Serverless Postgres with generous free tier.",
    },
    {
      name: "MongoDB Atlas",
      rationale: "Document database for flexible schemas.",
    },
  ],
  "State Management": [
    {
      name: "TanStack Query",
      rationale: "Server state caching with minimal boilerplate.",
    },
    {
      name: "Jotai",
      rationale: "Atomic state model for fine-grained updates.",
    },
    {
      name: "Redux Toolkit",
      rationale: "Predictable state for larger teams.",
    },
  ],
  "AI Provider": [
    {
      name: "Anthropic",
      rationale: "Strong reasoning for complex agent workflows.",
    },
    {
      name: "Google Gemini",
      rationale: "Competitive pricing with multimodal support.",
    },
    {
      name: "Groq",
      rationale: "Ultra-fast inference for real-time features.",
    },
  ],
  Payments: [
    {
      name: "Lemon Squeezy",
      rationale: "Merchant of record with simple tax handling.",
    },
    {
      name: "Paddle",
      rationale: "Global subscriptions with built-in compliance.",
    },
    {
      name: "PayPal",
      rationale: "Familiar checkout for broad consumer reach.",
    },
  ],
};

interface CategoryConfig {
  id: string;
  title: string;
  description: string;
  icon: typeof LayoutGrid;
  options: string[];
  defaultValue: string;
  confirmed?: boolean;
  showActions?: boolean;
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: "frontend-framework",
    title: "Frontend Framework",
    description: "The primary framework for your application",
    icon: LayoutGrid,
    options: [
      "Expo (React Native)",
      "Next.js",
      "Remix",
      "Vue",
      "SvelteKit",
    ],
    defaultValue: "Expo (React Native)",
    confirmed: true,
    showActions: false,
  },
  {
    id: "authentication",
    title: "Authentication",
    description: "User authentication and authorization",
    icon: Lock,
    options: ["OAuth", "Clerk", "Auth.js", "Supabase Auth", "Custom JWT"],
    defaultValue: "OAuth",
  },
  {
    id: "database",
    title: "Database",
    description: "Primary database for your application",
    icon: Database,
    options: [
      "Supabase (PostgreSQL)",
      "PlanetScale",
      "Neon",
      "MongoDB Atlas",
      "SQLite",
    ],
    defaultValue: "Supabase (PostgreSQL)",
  },
  {
    id: "state-management",
    title: "State Management",
    description: "Client-side state management",
    icon: Box,
    options: ["Zustand", "TanStack Query", "Jotai", "Redux Toolkit", "Context"],
    defaultValue: "Zustand",
  },
  {
    id: "ai-provider",
    title: "AI Provider",
    description: "For RAG, features and AI capabilities",
    icon: Cpu,
    options: ["OpenAI", "Anthropic", "Google Gemini", "Groq", "Local LLM"],
    defaultValue: "OpenAI",
  },
  {
    id: "payments",
    title: "Payments",
    description: "Payment processing and subscriptions",
    icon: CreditCard,
    options: ["Stripe", "Lemon Squeezy", "Paddle", "PayPal"],
    defaultValue: "Stripe",
  },
];

type CategoryState = {
  value: string;
  skipped: boolean;
};

export default function StackPage() {
  const { state, updateStackValue, markStackSkipped } = useWizard();
  const [suggestCategory, setSuggestCategory] = useState<string | null>(null);

  function applySuggestion(id: string, suggestion: SuggestionOption) {
    updateStackValue(id, suggestion.name, "suggested");
  }

  const activeCategory = CATEGORIES.find((c) => c.id === suggestCategory);

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={3} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">
            Choose Your Tech Stack
          </h1>
          <p className="mx-auto mt-3 max-w-[480px] text-sm text-[#888]">
            Select the tech stack you want to work with. AI suggestions are
            tailored to your case.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {CATEGORIES.map((category) => (
            <StackCategoryRow
              key={category.id}
              title={category.title}
              description={category.description}
              icon={category.icon}
              options={category.options}
              value={state.stack[category.id]?.value ?? category.defaultValue}
              onValueChange={(value) => updateStackValue(category.id, value, "user")}
              confirmed={category.confirmed}
              skipped={state.stack[category.id]?.skipped ?? false}
              showActions={category.showActions !== false}
              onSuggest={() => setSuggestCategory(category.id)}
              onNotNeeded={() => markStackSkipped(category.id)}
            />
          ))}
        </div>
      </main>

      <WizardBottomNav
        backHref="/new-project/features"
        continueHref="/new-project/continuous"
      />

      {activeCategory && (
        <SuggestDialog
          open={suggestCategory !== null}
          onOpenChange={(open) => {
            if (!open) setSuggestCategory(null);
          }}
          categoryTitle={activeCategory.title}
          suggestions={MOCK_SUGGESTIONS[activeCategory.title] ?? []}
          onSelect={(suggestion) =>
            applySuggestion(activeCategory.id, suggestion)
          }
        />
      )}
    </div>
  );
}
