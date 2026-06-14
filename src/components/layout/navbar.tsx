"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const productsItems = [
  {
    title: "Context Packages",
    href: "/",
    description: "Generate versioned AI development context for your projects",
  },
  {
    title: "Registry",
    href: "/registry",
    description: "Browse the technology registry and community suggestions",
  },
  {
    title: "Templates",
    href: "#templates",
    description: "Start from pre-built project templates",
  },
];

const supportItems = [
  {
    title: "Documentation",
    href: "#docs",
    description: "Guides and API reference",
  },
  {
    title: "Contact",
    href: "#contact",
    description: "Get in touch with our team",
  },
  {
    title: "Status",
    href: "#status",
    description: "System uptime and incident reports",
  },
];

const navLinks = [
  { label: "Docs & Guides", href: "#docs" },
  { label: "Pricing", href: "#pricing" },
  { label: "Blog", href: "#blog" },
  { label: "Examples", href: "#examples" },
];

const navTriggerClass =
  "h-9 bg-transparent px-3 text-sm font-medium text-neutral-400 shadow-none hover:bg-transparent hover:text-white focus:bg-transparent focus:text-white data-open:bg-transparent data-open:text-white data-open:hover:bg-transparent data-open:hover:text-white data-popup-open:bg-transparent data-popup-open:text-white data-popup-open:hover:bg-transparent data-popup-open:hover:text-white";

const navLinkClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-transparent px-3 text-sm font-medium text-neutral-400 transition-colors hover:bg-transparent hover:text-white focus:bg-transparent focus:text-white";

const dropdownLinkClass =
  "block rounded-md bg-transparent p-3 text-sm transition-colors hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white";

function ContextForgeLogo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5", className)}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-white"
      >
        <path
          d="M6 8C6 5.79086 7.79086 4 10 4C11.2 4 12.27 4.58 13 5.45"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M18 16C18 18.2091 16.2091 20 14 20C12.8 20 11.73 19.42 11 18.55"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="6" cy="8" r="1.5" fill="currentColor" />
        <circle cx="18" cy="16" r="1.5" fill="currentColor" />
        <path
          d="M10 4C12.5 4 14.5 5.5 16 8C17.5 10.5 17.5 13.5 16 16C14.5 18.5 12.5 20 10 20C7.5 20 5.5 18.5 4 16"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="4" r="1.5" fill="currentColor" />
        <circle cx="10" cy="20" r="1.5" fill="currentColor" />
      </svg>
      <span className="text-base font-semibold tracking-tight text-white">
        ContextForge
      </span>
    </Link>
  );
}

function DropdownLink({
  title,
  href,
  description,
}: {
  title: string;
  href: string;
  description: string;
}) {
  return (
    <li>
      <NavigationMenuLink
        render={<Link href={href} />}
        className={dropdownLinkClass}
      >
        <div className="font-medium text-white">{title}</div>
        <p className="mt-1 text-xs leading-snug text-neutral-500">{description}</p>
      </NavigationMenuLink>
    </li>
  );
}

function ThemeToggle({
  isDark,
  onToggle,
  className,
}: {
  isDark: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "text-neutral-400 hover:bg-white/5 hover:text-white",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

function DesktopNav() {
  return (
    <NavigationMenu className="hidden lg:flex">
      <NavigationMenuList className="gap-1">
        <NavigationMenuItem>
          <NavigationMenuTrigger className={navTriggerClass}>
            Products
          </NavigationMenuTrigger>
          <NavigationMenuContent className="border border-white/10 bg-[#0A0A0A] p-0 shadow-xl ring-0">
            <ul className="w-[300px] p-2">
              {productsItems.map((item) => (
                <DropdownLink key={item.title} {...item} />
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {navLinks.map((link) => (
          <NavigationMenuItem key={link.label}>
            <NavigationMenuLink
              render={<Link href={link.href} />}
              className={navLinkClass}
            >
              {link.label}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}

        <NavigationMenuItem>
          <NavigationMenuTrigger className={navTriggerClass}>
            Support
          </NavigationMenuTrigger>
          <NavigationMenuContent className="border border-white/10 bg-[#0A0A0A] p-0 shadow-xl ring-0">
            <ul className="w-[280px] p-2">
              {supportItems.map((item) => (
                <DropdownLink key={item.title} {...item} />
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function MobileNav({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-neutral-400 hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full border-white/10 bg-[#0A0A0A] text-white sm:max-w-sm"
      >
        <SheetHeader className="border-b border-white/10 pb-4">
          <SheetTitle className="text-left">
            <ContextForgeLogo />
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4">
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Products
          </p>
          {productsItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm text-neutral-400 transition-colors hover:text-white"
            >
              {item.title}
            </Link>
          ))}

          <div className="my-2 border-t border-white/10" />

          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm text-neutral-400 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}

          <p className="mt-2 px-3 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Support
          </p>
          {supportItems.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm text-neutral-400 transition-colors hover:text-white"
            >
              {item.title}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t border-white/10 p-4">
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          <Button
            render={<Link href="/new-project/basics" />}
            onClick={() => setOpen(false)}
            className="flex-1 rounded-full bg-white font-medium text-neutral-900 hover:bg-white/90"
          >
            Get Started Free
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const isWizardRoute = pathname.startsWith("/new-project");
  const isDashboardAppRoute = pathname.startsWith("/dashboard/projects");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("contextforge-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = stored === "dark" || (!stored && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("contextforge-theme", next ? "dark" : "light");
      return next;
    });
  }

  if (isWizardRoute || isDashboardAppRoute) {
    return null;
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full bg-[#0A0A0A] transition-[border-color,backdrop-filter] duration-200",
        scrolled && "border-b border-white/[0.08] backdrop-blur-md",
      )}
    >
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <ContextForgeLogo />

        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
          <DesktopNav />
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle
            isDark={isDark}
            onToggle={toggleTheme}
            className="hidden lg:inline-flex"
          />
          <Button
            render={<Link href="/new-project/basics" />}
            className="hidden rounded-full bg-white px-5 font-medium text-neutral-900 hover:bg-white/90 lg:inline-flex"
          >
            Get Started Free
          </Button>
          <MobileNav isDark={isDark} onToggleTheme={toggleTheme} />
        </div>
      </div>
    </header>
  );
}
