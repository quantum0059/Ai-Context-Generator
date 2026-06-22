"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, LayoutGrid, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TEMPLATES } from "@/lib/templates";

export default function TemplatesPage() {
  const router = useRouter();

  const handleUseTemplate = (spec: any) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("contextforge_template_spec", JSON.stringify(spec));
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pb-20">
      <section className="px-4 py-16 text-center sm:py-20">
        <Badge
          variant="outline"
          className="mb-6 border-white/20 bg-transparent px-3 py-1 text-xs font-normal text-[#888]"
        >
          ✦ Production-Ready Blueprints
        </Badge>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-[56px]">
          Explore Project Templates
        </h1>

        <p className="mx-auto mt-5 max-w-[520px] text-sm leading-relaxed text-[#888] sm:text-base">
          Start with a pre-configured architecture. pre-fill the wizard with hand-picked technology stacks and features.
        </p>
      </section>

      <main className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((tpl) => {
            const isMobile = tpl.spec.platform.includes("mobile");
            return (
              <Card
                key={tpl.id}
                className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#111111] hover:border-white/[0.16] hover:bg-[#121212] transition-all duration-300 group shadow-md"
              >
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="border-white/10 bg-white/5 text-[#aaa] text-xs">
                      {isMobile ? "Mobile App" : "Web Application"}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl font-bold text-white group-hover:text-neutral-200 transition-colors">
                    {tpl.name}
                  </CardTitle>
                  <CardDescription className="text-sm text-[#888] mt-2 line-clamp-2">
                    {tpl.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6 flex-1">
                  {/* Tech stack badges */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#666] mb-2.5">
                      Tech Stack
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(tpl.spec.stack).map(([key, entry]: [string, any]) => (
                        <span
                          key={key}
                          className="rounded bg-white/5 px-2 py-0.5 text-xs text-[#ccc] border border-white/[0.04]"
                        >
                          {entry.value}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Feature list */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#666] mb-2.5">
                      Included Features
                    </h4>
                    <ul className="space-y-1.5">
                      {tpl.spec.features.slice(0, 4).map((feat: string) => (
                        <li key={feat} className="flex items-start gap-2 text-xs text-[#aaa]">
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                      {tpl.spec.features.length > 4 && (
                        <li className="text-xs text-[#555] pl-5.5 italic">
                          + {tpl.spec.features.length - 4} more features
                        </li>
                      )}
                    </ul>
                  </div>
                </CardContent>

                <CardFooter className="pt-4 border-t border-white/[0.04]">
                  <Button
                    onClick={() => handleUseTemplate(tpl.spec)}
                    className="w-full h-10 rounded-lg bg-white hover:bg-white/90 text-[#0A0A0A] font-semibold text-sm flex items-center justify-center gap-2 group-hover:gap-3 transition-all"
                  >
                    Use This Template
                    <ArrowRight className="size-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
