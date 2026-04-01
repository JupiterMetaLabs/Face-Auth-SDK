import { generateReferenceId } from "../../core/idGenerator";

const ID_REGEX = /^ref_[0-9a-f]{12}_[0-9a-f]{20}$/;

describe("generateReferenceId", () => {
  it("matches expected format ref_<timestamp>_<random>", () => {
    expect(generateReferenceId()).toMatch(ID_REGEX);
  });

  it("produces unique IDs across 1000 calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, generateReferenceId));
    expect(ids.size).toBe(1000);
  });

  it("IDs are monotonically ordered by generation time", () => {
    const a = generateReferenceId();
    const b = generateReferenceId();
    expect(a.split("_")[1] <= b.split("_")[1]).toBe(true);
  });

  it("is a function with no external dependencies", () => {
    expect(typeof generateReferenceId).toBe("function");
  });
});
