// Tests exercise the package through its entry point only — same seam as
// callers. Deep imports (e.g. "../lib/impl") are lint errors.

import assert from "node:assert";
import { greet } from "../index";

assert.equal(greet("world"), "Hello, world!");
