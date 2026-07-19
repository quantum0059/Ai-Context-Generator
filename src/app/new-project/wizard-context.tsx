"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import type { Confidence, DiscoveredCategory, ProjectConstraints, StackSource } from "@/types/projectspec";

interface WizardStackEntry {
  value: string;
  skipped: boolean;
  source?: StackSource;
  confidence?: Confidence;
}

export interface WizardState {
  projectName: string;
  description: string;
  features: string[];
  stack: Record<string, WizardStackEntry>;
  budget: string;
  avoid: string;
  designReferences: string;
  designReferenceImages: string[];
  technicalConstraints?: ProjectConstraints;
  projectType?: string;
  classificationReason?: string;
  fullCategories?: DiscoveredCategory[];
}

const DEFAULT_STATE: WizardState = {
  projectName: "",
  description: "",
  features: [],
  // Stack choices are populated only after category discovery and recommendation.
  stack: {},
  budget: "",
  avoid: "",
  designReferences: "",
  designReferenceImages: [],
  technicalConstraints: undefined,
  projectType: "",
  classificationReason: "",
  fullCategories: [],
};

interface WizardContextProps {
  state: WizardState;
  updateState: (patch: Partial<WizardState>) => void;
  updateStackValue: (id: string, value: string, source?: StackSource, confidence?: Confidence) => void;
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
        const wizardStack: Record<string, WizardStackEntry> = {};
        if (spec.stack) {
          for (const [category, entry] of Object.entries(spec.stack)) {
            const entryVal = entry as { value: string | null; source?: string; confidence?: Confidence };
            wizardStack[category] = {
              value: entryVal.value || "",
              skipped: entryVal.value === null,
              source: (entryVal.source as StackSource) || "user",
              confidence: entryVal.confidence,
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
          designReferences: (spec.designReferences || [])
            .filter((reference: string) => !reference.includes("res.cloudinary.com"))
            .join(", "),
          designReferenceImages: (spec.designReferences || []).filter((reference: string) => reference.includes("res.cloudinary.com")),
          technicalConstraints: spec.constraints?.technical,
          projectType: spec.projectType || "",
          classificationReason: spec.classificationReason || "",
          fullCategories: [],
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

  const updateStackValue = (
    id: string,
    value: string,
    source: StackSource = "user",
    confidence: Confidence = "high",
  ) => {
    setState((prev) => ({
      ...prev,
      stack: {
        ...prev.stack,
        [id]: { value, skipped: false, source, confidence },
      },
    }));
  };

  const markStackSkipped = (id: string) => {
    setState((prev) => ({
      ...prev,
      stack: {
        ...prev.stack,
        [id]: { ...(prev.stack[id] ?? { value: "", source: "user" as const }), skipped: true },
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
