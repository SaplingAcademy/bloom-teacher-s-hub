// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: { user: null as any, profile: null as any } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth.value }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => k }) }));

import { TeacherAvatarContent, useTeacherIdentity } from "../src/components/layout/TeacherAvatar";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function render(user: any, profile: any) {
  auth.value = { user, profile };
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let identity: ReturnType<typeof useTeacherIdentity> | null = null;
  function Probe() {
    identity = useTeacherIdentity();
    return createElement(TeacherAvatarContent);
  }
  act(() => root!.render(createElement(Probe)));
  return { container, identity: () => identity! };
}

const email = "mariana.albuquerque@escola.com";

describe("shared teacher avatar (top bar + sidebar)", () => {
  it("prefers the profile photo", () => {
    const { container } = render({ email }, { full_name: "Mariana Albuquerque", avatar_url: "https://cdn.example/a.png" });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/a.png");
  });

  it("without a photo shows the real name's initials, even when the name resembles the e-mail", () => {
    const { container, identity } = render({ email }, { full_name: "Mariana Albuquerque", avatar_url: null });
    expect(container.textContent).toBe("MA");
    expect(identity()).toEqual({ name: "Mariana Albuquerque", email, avatarUrl: null });
  });

  it("falls back to the initials when the photo fails to load", () => {
    const { container } = render({ email }, { full_name: "Mariana Albuquerque", avatar_url: "https://cdn.example/broken.png" });
    act(() => { container.querySelector("img")!.dispatchEvent(new Event("error")); });
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("MA");
  });

  it("without a valid name and photo shows the neutral user icon", () => {
    const { container } = render({ email: "prof@escola.com" }, { full_name: null, avatar_url: null });
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toBe("");
  });
});
