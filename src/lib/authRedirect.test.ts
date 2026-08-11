import { describe, expect, it } from "vitest";
import { buildAuthCallbackUrl, sanitizeNextPath } from "./authRedirect";

describe("auth redirect safety", () => {
  it.each([
    [null, "/"],
    ["", "/"],
    ["https://attacker.example/steal", "/"],
    ["//attacker.example/steal", "/"],
    ["/\\attacker.example/steal", "/"],
    ["javascript:alert(1)", "/"],
    ["/checkout?price=mosh_supporter_once", "/checkout?price=mosh_supporter_once"],
  ])("sanitizes %s to %s", (raw, expected) => {
    expect(sanitizeNextPath(raw)).toBe(expected);
  });

  it("builds an origin-bound callback that preserves the relative destination", () => {
    expect(
      buildAuthCallbackUrl(
        "https://ether-mosh.netlify.app",
        "/checkout?price=mosh_supporter_once",
      ),
    ).toBe(
      "https://ether-mosh.netlify.app/auth/callback?next=%2Fcheckout%3Fprice%3Dmosh_supporter_once",
    );
  });
});
