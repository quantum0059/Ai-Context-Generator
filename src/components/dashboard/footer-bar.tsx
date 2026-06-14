import {
  BadgeCheck,
  Code,
  Layers,
  ShieldCheck,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Smart & Fast",
    description: "AI-generated in seconds",
  },
  {
    icon: ShieldCheck,
    title: "Secure & Private",
    description: "Your data stays yours",
  },
  {
    icon: Layers,
    title: "Flexible",
    description: "Works with your stack",
  },
  {
    icon: Code,
    title: "Code-Ready",
    description: "Production-ready output",
  },
  {
    icon: BadgeCheck,
    title: "Trusted by Devs",
    description: "Loved by developers",
  },
];

export function FooterBar() {
  return (
    <section className="border-t border-white/[0.06] bg-[#0A0A0A]">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-3 lg:grid-cols-5 lg:px-8">
        {features.map((feature) => (
          <div key={feature.title} className="flex flex-col items-center text-center sm:items-start sm:text-left">
            <feature.icon className="mb-2 size-4 text-[#888]" />
            <p className="text-sm font-semibold text-white">{feature.title}</p>
            <p className="mt-0.5 text-xs text-[#888]">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
