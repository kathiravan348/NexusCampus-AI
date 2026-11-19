import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** Node mock API for Vitest and other Node tools. */
export const server = setupServer(...handlers);
