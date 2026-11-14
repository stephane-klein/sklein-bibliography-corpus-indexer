<script>
    import { setContext, untrack } from "svelte";
    import { m } from "#lib/paraglide/messages.js";
    import { page } from "$app/state";
    import SiteHeader from "#lib/client/SiteHeader.svelte";
    import {
        DOCUMENTS_DENSITY_CONTEXT,
        DOCUMENTS_DENSITY_COOKIE,
        DOCUMENTS_DENSITY_DENSE,
        DOCUMENTS_DENSITY_DETAILED,
        DOCUMENTS_DENSITY_MAX_AGE,
    } from "#lib/shared/documents-density.js";

    let { children, data } = $props();

    let dense = $state(untrack(() => data.dense));

    // Only the documents list has two layouts. Showing the switch on a page it
    // does not change would promise an action without effect.
    const onDocumentsList = $derived(page.url.pathname.replace(/\/+$/, "") === "/documents");

    function setDense(value) {
        dense = value;
        document.cookie = `${DOCUMENTS_DENSITY_COOKIE}=${
            value ? DOCUMENTS_DENSITY_DENSE : DOCUMENTS_DENSITY_DETAILED
        }; path=/; max-age=${DOCUMENTS_DENSITY_MAX_AGE}; SameSite=Lax`;
    }

    // The getter keeps the page reactive: it reads a $state variable, so a click
    // in the header re-renders the controller without a server round trip.
    setContext(DOCUMENTS_DENSITY_CONTEXT, {
        get dense() {
            return dense;
        },
        setDense,
    });
</script>

<SiteHeader user={data.user}>
    {#snippet extra()}
        {#if onDocumentsList}
            <div class="flex items-center gap-1.5 text-sm text-gray-500">
                <span>{m.interface_density_label()}</span>
                <span class="density-segments">
                    <button
                        type="button"
                        aria-pressed={dense}
                        onclick={() => setDense(true)}>{m.interface_density_dense()}</button
                    >
                    <button
                        type="button"
                        aria-pressed={!dense}
                        onclick={() => setDense(false)}>{m.interface_density_detailed()}</button
                    >
                </span>
            </div>
        {/if}
    {/snippet}
</SiteHeader>

{@render children()}

<style>
    .density-segments {
        display: inline-flex;
        border: 1px solid #d1d5db;
        border-radius: 3px;
        overflow: hidden;
    }

    .density-segments button {
        border: 0;
        background: #fff;
        padding: 1px 8px;
        font: inherit;
        color: #4b5563;
        cursor: pointer;
    }

    .density-segments button + button {
        border-left: 1px solid #d1d5db;
    }

    .density-segments button:hover {
        background: #f9fafb;
    }

    .density-segments button[aria-pressed="true"] {
        background: #f3f4f6;
        color: #111827;
        font-weight: 600;
    }

    .density-segments button:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: -2px;
    }
</style>
