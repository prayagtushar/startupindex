// The /vitest entry registers jest-dom's matchers AND their types. Extending
// `expect` by hand left `toBeInTheDocument` untyped, so `bun run check-types`
// failed on every assertion that used one.
import "@testing-library/jest-dom/vitest";
