<script>
    import { m } from "#lib/paraglide/messages.js";
    import { page } from "$app/state";

    let { user, extra } = $props();

    function isActive(href) {
        return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
    }
</script>

<header class="border-b border-gray-300 bg-white">
    <div class="page px-5 py-2 flex flex-wrap items-center justify-between gap-3">
        <a
            href={user ? "/documents" : "/"}
            class="font-bold text-base no-underline">{m.app_name()}</a
        >
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1">
            {#if extra}
                {@render extra()}
            {/if}
            <nav>
                {#if user}
                    <a
                        href="/documents"
                        class="text-sm text-gray-500 no-underline hover:text-blue-600 hover:underline"
                        class:active={isActive("/documents")}
                        aria-current={isActive("/documents") ? "page" : undefined}>{m.nav_documents()}</a
                    >
                    |
                    <a
                        href="/my/profile"
                        class="text-sm text-gray-500 no-underline hover:text-blue-600 hover:underline"
                        class:active={isActive("/my/profile")}
                        aria-current={isActive("/my/profile") ? "page" : undefined}>{m.nav_profile()}</a
                    >
                    |
                    <a
                        href="/my/preference"
                        class="text-sm text-gray-500 no-underline hover:text-blue-600 hover:underline"
                        class:active={isActive("/my/preference")}
                        aria-current={isActive("/my/preference") ? "page" : undefined}>{m.nav_preferences()}</a
                    >
                    |
                    <a
                        href="/my/tokens"
                        class="text-sm text-gray-500 no-underline hover:text-blue-600 hover:underline"
                        class:active={isActive("/my/tokens")}
                        aria-current={isActive("/my/tokens") ? "page" : undefined}>{m.nav_tokens()}</a
                    >
                    |
                    <a
                        href="/mcp/log/"
                        class="text-sm text-gray-500 no-underline hover:text-blue-600 hover:underline"
                        class:active={isActive("/mcp/log")}
                        aria-current={isActive("/mcp/log") ? "page" : undefined}>{m.nav_mcp_log()}</a
                    >
                    |
                    <a
                        href="/logout"
                        class="text-sm text-gray-500 no-underline hover:text-blue-600 hover:underline"
                        >{m.nav_sign_out()}</a
                    >
                {:else}
                    <a
                        href="/login"
                        class="text-sm text-gray-500 no-underline hover:text-blue-600 hover:underline">{m.sign_in()}</a
                    >
                    |
                    <a
                        href="/signup"
                        class="text-sm text-gray-500 no-underline hover:text-blue-600 hover:underline"
                        >{m.create_account()}</a
                    >
                {/if}
            </nav>
        </div>
    </div>
</header>

<style>
    nav a.active {
        color: #111827;
        font-weight: 600;
    }

    nav a.active:hover {
        color: #111827;
        text-decoration: none;
    }
</style>
