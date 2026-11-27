import { isSignupEnabled } from "#lib/server/signup.js";

export function load(event) {
    return {
        user: event.locals.user,
        signupEnabled: isSignupEnabled(),
    };
}
