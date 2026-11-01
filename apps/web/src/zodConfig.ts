import { z } from "zod";

// Imported first in main.tsx: schemas decide at definition time whether to probe `new Function`.
// Our CSP forbids eval, so the probe would be reported as a CSP violation.
z.config({ jitless: true });
