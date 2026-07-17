import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  loginUser: vi.fn(),
  loginWithGoogleApi: vi.fn(),
  registerUser: vi.fn(),
  getCurrentUser: vi.fn(),
  updateUserProfile: vi.fn(),
}));

vi.mock("@/utils/api", () => apiMocks);

const profile = {
  id: "user-1",
  username: "tester",
  nickname: "Test User",
  role: "user" as const,
  createdAt: "2026-07-17T00:00:00.000Z",
};

async function freshUseUser() {
  vi.resetModules();
  const { useUser } = await import("./useUser");
  return useUser();
}

describe("useUser authentication lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("finishes bootstrap when the visitor has no stored token", async () => {
    const auth = await freshUseUser();
    expect(auth.isInitializing.value).toBe(true);

    await expect(auth.ensureSession()).resolves.toBeNull();

    expect(auth.isInitializing.value).toBe(false);
    expect(auth.isLoggedIn.value).toBe(false);
  });

  it("marks initialization complete as soon as login succeeds", async () => {
    const auth = await freshUseUser();
    await auth.ensureSession();
    apiMocks.loginUser.mockResolvedValue({ token: "signed-token", user: profile });

    await expect(auth.login({ username: "tester", password: "secret" }))
      .resolves.toEqual(profile);

    expect(auth.isInitializing.value).toBe(false);
    expect(auth.isLoggedIn.value).toBe(true);
    expect(auth.currentUser.value).toEqual(profile);
    expect(localStorage.getItem("omnicanvas_token")).toBe("signed-token");
  });
});
