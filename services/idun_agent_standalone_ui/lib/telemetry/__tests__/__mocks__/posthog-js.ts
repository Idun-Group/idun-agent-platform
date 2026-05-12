import { vi } from "vitest";

const mock = {
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  register: vi.fn(),
};

export default mock;
export const __mock = mock;
