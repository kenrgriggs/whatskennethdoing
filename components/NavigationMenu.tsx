"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Keep this list aligned with top-level routes intended to be user navigable.
const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/account", label: "Account" },
];

// Highlights parent links when browsing nested pages under that route.
function isActivePath(currentPath: string, href: string) {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function NavigationMenu() {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !menuPinned) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, menuPinned]);

  useEffect(() => {
    const root = document.documentElement;
    if (!menuOpen) {
      root.style.setProperty("--app-nav-offset", "0px");
      return;
    }

    // Shift only by what the centered page column needs to clear the sidebar.
    const updateNavOffset = () => {
      const contentAnchor =
        (document.querySelector("main > div.mx-auto") as HTMLElement | null) ??
        (document.querySelector("main") as HTMLElement | null);
      const sidebarWidth = sidebarRef.current?.getBoundingClientRect().width ?? 0;

      if (!contentAnchor || sidebarWidth <= 0) {
        root.style.setProperty("--app-nav-offset", "var(--app-nav-width)");
        return;
      }

      const currentOffset =
        Number.parseFloat(getComputedStyle(root).getPropertyValue("--app-nav-offset")) || 0;
      const shiftedAnchorLeft = contentAnchor.getBoundingClientRect().left;
      const baseAnchorLeft = shiftedAnchorLeft - currentOffset;
      const requiredOffset = Math.max(0, Math.ceil(sidebarWidth + 12 - baseAnchorLeft));
      root.style.setProperty("--app-nav-offset", `${requiredOffset}px`);
    };

    updateNavOffset();
    window.addEventListener("resize", updateNavOffset);

    return () => {
      window.removeEventListener("resize", updateNavOffset);
      root.style.setProperty("--app-nav-offset", "0px");
    };
  }, [menuOpen, pathname]);

  return (
    <>
      <button
        type="button"
        className="fixed left-4 top-4 z-[70] inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/70 bg-black/75 text-white shadow-lg backdrop-blur transition-colors hover:bg-white/10"
        aria-label={menuOpen ? "Close navigation sidebar" : "Open navigation sidebar"}
        aria-expanded={menuOpen}
        aria-controls="app-navigation-sidebar"
        onClick={() => setMenuOpen((value) => !value)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {menuOpen && !menuPinned ? (
        <button
          type="button"
          className="fixed inset-0 z-[60] bg-black/45"
          aria-label="Close navigation sidebar"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside
        id="app-navigation-sidebar"
        ref={sidebarRef}
        className={[
          "fixed inset-y-0 left-0 z-[65] w-[var(--app-nav-width)] border-r border-white/15 bg-gradient-to-b from-zinc-900/95 via-black/95 to-zinc-900/95 shadow-2xl backdrop-blur transition-transform duration-200",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-full flex-col px-4 pb-4 pt-4">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={[
                "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                menuPinned
                  ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-100"
                  : "border-white/25 bg-black/45 text-zinc-200 hover:bg-white/10",
              ].join(" ")}
              aria-pressed={menuPinned}
              aria-label={menuPinned ? "Unpin navigation sidebar" : "Pin navigation sidebar"}
              title={menuPinned ? "Unpin" : "Pin"}
              onClick={() => setMenuPinned((value) => !value)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M14.8 3.5a1 1 0 0 1 1 1v1.2l2.1 2.1a1 1 0 0 1-.71 1.7h-3.45v3.12l2.25 2.24a1 1 0 0 1-.7 1.71H13v4.2a1 1 0 0 1-2 0v-4.2H8.75a1 1 0 0 1-.7-1.7l2.25-2.25V9.5H6.8a1 1 0 0 1-.7-1.7l2.1-2.1V4.5a1 1 0 0 1 1-1h5.6Z" />
              </svg>
            </button>
          </div>

          <div className="mt-5 flex-1 rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Navigation
            </div>

            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "border border-white/20 bg-white/10 text-white"
                        : "text-zinc-300 hover:bg-white/8 hover:text-white",
                    ].join(" ")}
                    onClick={() => {
                      if (!menuPinned) setMenuOpen(false);
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}

