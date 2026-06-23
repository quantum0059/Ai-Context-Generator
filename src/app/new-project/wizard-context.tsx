"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface WizardState {
  projectName: string;
  description: string;
  features: string[];
  stack: Record<string, { value: string; skipped: boolean; source?: "user" | "suggested" | "community" }>;
  budget: string;
  avoid: string;
  designReferences: string;
  projectType?: string;
  classificationReason?: string;
}

const DEFAULT_STATE: WizardState = {
  projectName: "",
  description: "",
  features: [],
  stack: {
    "frontend-framework": { value: "Expo (React Native)", skipped: false, source: "user" },
    "authentication": { value: "OAuth", skipped: false, source: "user" },
    "database": { value: "Supabase (PostgreSQL)", skipped: false, source: "user" },
    "state-management": { value: "Zustand", skipped: false, source: "user" },
    "ai-provider": { value: "OpenAI", skipped: false, source: "user" },
    "payments": { value: "Stripe", skipped: false, source: "user" },
  },
  budget: "",
  avoid: "",
  designReferences: "",
  projectType: "",
  classificationReason: "",
};

interface WizardContextProps {
  state: WizardState;
  updateState: (patch: Partial<WizardState>) => void;
  updateStackValue: (id: string, value: string, source?: "user" | "suggested" | "community") => void;
  markStackSkipped: (id: string) => void;
  resetWizard: () => void;
}

const WizardContext = createContext<WizardContextProps | undefined>(undefined);

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);

  // Load from sessionStorage on mount
  useEffect(() => {
    const templateSpecStr = sessionStorage.getItem("contextforge_template_spec");
    if (templateSpecStr) {
      try {
        const spec = JSON.parse(templateSpecStr);
        // Map ProjectSpec to WizardState
        const wizardStack: Record<string, { value: string; skipped: boolean; source: "user" | "suggested" | "community" }> = {};
        if (spec.stack) {
          for (const [category, entry] of Object.entries(spec.stack)) {
            const entryVal = entry as { value: string | null; source?: string };
            wizardStack[category] = {
              value: entryVal.value || "",
              skipped: entryVal.value === null,
              source: (entryVal.source as "user" | "suggested" | "community") || "user"
            };
          }
        }
        const templateState: WizardState = {
          projectName: spec.projectName || "",
          description: spec.description || "",
          features: spec.features || [],
          stack: wizardStack,
          budget: spec.constraints?.budget || "",
          avoid: (spec.constraints?.avoid || []).join(", "),
          designReferences: (spec.designReferences || []).join(", "),
          projectType: spec.projectType || "",
          classificationReason: spec.classificationReason || "",
        };
        setState(templateState);
        sessionStorage.removeItem("contextforge_template_spec");
      } catch (e) {
        console.error("Failed to parse template spec", e);
      }
    }
  }, []);

  const updateState = (patch: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const updateStackValue = (id: string, value: string, source: "user" | "suggested" | "community" = "user") => {
    setState((prev) => ({
      ...prev,
      stack: {
        ...prev.stack,
        [id]: { value, skipped: false, source },
      },
    }));
  };

  const markStackSkipped = (id: string) => {
    setState((prev) => ({
      ...prev,
      stack: {
        ...prev.stack,
        [id]: { ...prev.stack[id], skipped: true },
      },
    }));
  };

  const resetWizard = () => {
    setState(DEFAULT_STATE);
  };

  return (
    <WizardContext.Provider
      value={{
        state,
        updateState,
        updateStackValue,
        markStackSkipped,
        resetWizard,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return context;
}
