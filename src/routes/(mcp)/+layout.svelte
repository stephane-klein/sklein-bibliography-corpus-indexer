<script>
    import SiteHeader from "#lib/client/SiteHeader.svelte";

    let { children, data } = $props();
</script>

<SiteHeader user={data.user} />

{@render children()}
