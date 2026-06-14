Build a production-ready top navigation bar for ContextForge using Next.js 14 App Router + TypeScript + Tailwind CSS + shadcn/ui.

DESIGN REFERENCE:
- Dark background (#0A0A0A), full width, sticky top
- Height: 64px
- Left: Logo (icon + "ContextForge" text, white)
- Center: Nav links — Products (dropdown), Docs & Guides, Pricing, Blog, Examples, Support (dropdown)
- Right: Theme toggle (sun/moon icon), "Get Started Free" button (white filled, dark text, rounded-full, font-weight 500)
- Dropdowns styled dark, matching the navbar background

RULES:
- Use shadcn/ui NavigationMenu for the nav links with dropdown support
- Use shadcn/ui Button for "Get Started Free"
- Mobile: collapse to hamburger menu using shadcn/ui Sheet
- Sticky with backdrop-blur on scroll (add border-bottom: 1px solid rgba(255,255,255,0.08) when scrolled)
- No colored backgrounds on nav links — white/gray text only, white on hover
- Logo icon can be a placeholder SVG or Lucide "brain" icon

EXPORT: default Navbar component