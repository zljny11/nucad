type StoreLike = {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
};

type LicenseResult = [boolean, string, string, string, string];

const safeWindowRequire =
  typeof window !== "undefined" && typeof window.require === "function"
    ? window.require.bind(window)
    : null;

function createMemoryStore(): StoreLike {
  const data = new Map<string, any>([
    ["attempts", 5],
    ["address", ""],
  ]);

  return {
    get(key: string) {
      return data.get(key);
    },
    set(key: string, value: any) {
      data.set(key, value);
    },
  };
}

function getElectronStore(): StoreLike {
  if (!safeWindowRequire) {
    return createMemoryStore();
  }

  const Store = safeWindowRequire("electron-store");
  return new Store();
}

function getBypassedLicenseResult(): LicenseResult {
  return [true, "bypass", "20991231", "9999", "1111111"];
}

export { safeWindowRequire, getElectronStore, getBypassedLicenseResult };
