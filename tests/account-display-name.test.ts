import { describe, expect, it } from "vitest";
import { profileDisplayName, resolveAccountDisplayName, resolveTeacherName } from "../src/lib/teacher-name";

const user = { email: "mariana.albuquerque@escola.com", user_metadata: {} };

describe("sidebar account display name", () => {
  it("keeps a saved profile name even when it resembles the e-mail address", () => {
    const profile = { full_name: "Mariana Albuquerque" };
    expect(resolveAccountDisplayName(profile, user)).toBe("Mariana Albuquerque");
    // The top bar keeps its existing rule (unchanged).
    expect(resolveTeacherName(profile, user)).toBeNull();
  });

  it("rejects only empty, placeholder or e-mail-like saved values", () => {
    expect(profileDisplayName({ full_name: "  " })).toBeNull();
    expect(profileDisplayName({ full_name: "Professor" })).toBeNull();
    expect(profileDisplayName({ full_name: "mariana.albuquerque@escola.com" })).toBeNull();
    expect(profileDisplayName({ full_name: "Ana Lima" })).toBe("Ana Lima");
  });

  it("without a saved name, falls back to the existing Auth-metadata rule, else null", () => {
    expect(resolveAccountDisplayName({ full_name: null }, { email: "x@y.com", user_metadata: { full_name: "Carla Dias" } })).toBe("Carla Dias");
    // Metadata derived from the e-mail is still filtered.
    expect(resolveAccountDisplayName({ full_name: null }, { email: "carla@y.com", user_metadata: { full_name: "carla" } })).toBeNull();
    expect(resolveAccountDisplayName(null, { email: "x@y.com" })).toBeNull();
  });
});
