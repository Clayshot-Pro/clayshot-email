import { preparePassword, checkPassword } from "../src/worker/passwordCrypto";

/** Isolated integration fixture executed inside workerd, not Node.js. */
export default {
  async fetch(): Promise<Response> {
    try {
      const password = "Runtime?Test2026";
      const hash = await preparePassword(password, "admin");
      const accepted = await checkPassword(password, {
        password_salt: hash.salt,
        password_hash: hash.hash,
        iterations: hash.iterations,
      });
      const denied = await checkPassword(password + "!", {
        password_salt: hash.salt,
        password_hash: hash.hash,
        iterations: hash.iterations,
      });
      return Response.json({ ok: accepted && !denied && hash.iterations === -1 });
    } catch (reason) {
      // Fixture logs error names only, not submitted secrets or parameters.
      return Response.json({ ok: false, error: reason instanceof Error ? reason.name : "unknown" }, { status: 500 });
    }
  },
};
