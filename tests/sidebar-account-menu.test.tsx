// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, onClick, className }: any) => createElement("a", { href: to, onClick, className }, children),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { email: "ana@escola.com" }, profile: { full_name: "Ana Lima" } }) }));
const LABELS: Record<string, string> = {
  "sidebarAccount.menu": "Menu da conta", "sidebarAccount.myProfile": "Meu perfil", "sidebarAccount.settings": "Configurações",
  "sidebarAccount.adminTag": "ADMIN", "nav.admin": "Administração",
};
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string, fb?: string) => LABELS[k] ?? fb ?? k }) }));

import { SidebarAccountMenu } from "../src/components/layout/SidebarAccountMenu";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function renderOpenMenu(isAdmin?: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(SidebarAccountMenu, {
    isExpanded: true, textClasses: "", open: true, onOpenChange: () => {}, onNavigate: () => {}, ...(isAdmin === undefined ? {} : { isAdmin }),
  })));
  const menu = document.querySelector('nav[aria-label="Menu da conta"]')!;
  return {
    links: [...menu.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]),
    separators: menu.querySelectorAll('[role="separator"]').length,
  };
}

describe("sidebar account menu", () => {
  it("shows Administração (with the ADMIN tag) after a separator for admins", () => {
    const { links, separators } = renderOpenMenu(true);
    expect(links).toEqual([["Meu perfil", "/profile"], ["Configurações", "/settings"], ["AdministraçãoADMIN", "/admin"]]);
    expect(separators).toBe(1);
  });

  it("hides the option and the separator for teachers without admin permission", () => {
    for (const isAdmin of [false, undefined]) {
      act(() => root?.unmount());
      document.body.innerHTML = "";
      const { links, separators } = renderOpenMenu(isAdmin);
      expect(links).toEqual([["Meu perfil", "/profile"], ["Configurações", "/settings"]]);
      expect(separators).toBe(0);
    }
  });
});
