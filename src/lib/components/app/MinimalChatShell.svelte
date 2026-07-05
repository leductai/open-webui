<script lang="ts">
	import { onMount, tick, getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	import { getModels, getToolServersData } from '$lib/apis';
	import { getTools } from '$lib/apis/tools';
	import { getTerminalServers } from '$lib/apis/terminal';
	import { getUserSettings } from '$lib/apis/users';
	import { setTextScale } from '$lib/utils/text-scale';
	import { WEBUI_API_BASE_URL } from '$lib/constants';

	import {
		config,
		user,
		settings,
		models,
		tools,
		toolServers,
		terminalServers,
		selectedTerminalId,
		showSidebar,
		showControls
	} from '$lib/stores';

	import AccountPending from '$lib/components/layout/Overlay/AccountPending.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';

	const i18n = getContext('i18n');

	let loaded = false;

	const setUserSettings = async (cb?: () => Promise<void>) => {
		let userSettings = await getUserSettings(localStorage.token).catch((error) => {
			console.error(error);
			return null;
		});

		if (!userSettings) {
			try {
				userSettings = JSON.parse(localStorage.getItem('settings') ?? '{}');
			} catch (e: unknown) {
				console.error('Failed to parse settings from localStorage', e);
				userSettings = {};
			}
		}

		if (userSettings?.ui) {
			settings.set(userSettings.ui);
		}

		setTextScale($settings?.textScale ?? 1);

		if (cb) {
			await cb();
		}
	};

	const setModels = async () => {
		models.set(
			await getModels(
				localStorage.token,
				$config?.features?.enable_direct_connections ? ($settings?.directConnections ?? null) : null
			)
		);
	};

	const setTools = async () => {
		const toolsData = await getTools(localStorage.token);
		tools.set(toolsData);
	};

	const setToolServers = async () => {
		let toolServersData = await getToolServersData($settings?.toolServers ?? []);
		toolServersData = toolServersData.filter((data) => {
			if (!data || data.error) {
				toast.error(
					$i18n.t(`Failed to connect to {{URL}} OpenAPI tool server`, {
						URL: data?.url
					})
				);
				return false;
			}
			return true;
		});
		toolServers.set(toolServersData);

		const enabledTerminals = ($settings?.terminalServers ?? []).filter((s) => s.enabled);
		if (enabledTerminals.length > 0) {
			let terminalServersData = await getToolServersData(
				enabledTerminals.map((t) => ({
					url: t.url,
					auth_type: t.auth_type ?? 'bearer',
					key: t.key ?? '',
					path: t.path ?? '/openapi.json',
					config: { enable: true }
				}))
			);
			terminalServersData = terminalServersData
				.filter((data) => {
					if (!data || data.error) {
						toast.error(
							$i18n.t(`Failed to connect to {{URL}} terminal server`, {
								URL: data?.url
							})
						);
						return false;
					}
					return true;
				})
				.map((data, i) => ({
					...data,
					key: enabledTerminals[i]?.key ?? ''
				}));

			terminalServers.set(terminalServersData);
		} else {
			terminalServers.set([]);
		}

		const systemTerminals = await getTerminalServers(localStorage.token).catch((error) => {
			console.error('Failed to load system terminals:', error);
			return [];
		});
		if (systemTerminals.length > 0) {
			const terminalEntries = systemTerminals.map((t) => ({
				id: t.id,
				url: `${WEBUI_API_BASE_URL}/terminals/${t.id}`,
				name: t.name,
				key: localStorage.token
			}));
			terminalServers.update((existing) => [...existing, ...terminalEntries]);
		}
	};

	onMount(async () => {
		showSidebar.set(false);

		if ($user === undefined || $user === null) {
			await goto('/auth');
			return;
		}

		if (!['user', 'admin'].includes($user?.role)) {
			loaded = true;
			return;
		}

		await Promise.all([
			setTools().catch((e) => console.error('Failed to load tools:', e)),
			setUserSettings(async () => {
				await setModels().catch((e) => console.error('Failed to load models:', e));
			}).catch((e) => console.error('Failed to load user settings:', e))
		]);

		setToolServers().catch((e) => console.error('Failed to load tool servers:', e));

		await showControls.set(false);
		selectedTerminalId.set(localStorage.selectedTerminalId ?? null);
		selectedTerminalId.subscribe((value) => {
			if (value === null) {
				delete localStorage.selectedTerminalId;
			} else {
				localStorage.selectedTerminalId = value;
			}
		});

		await tick();
		loaded = true;
	});
</script>

{#if $user}
	<div class="app relative">
		<div class="text-gray-700 dark:text-gray-100 bg-transparent h-screen max-h-[100dvh] overflow-auto">
			{#if !['user', 'admin'].includes($user?.role)}
				<AccountPending />
			{:else if loaded}
				<slot />
			{:else}
				<div class="w-full h-full flex items-center justify-center">
					<Spinner className="size-5" />
				</div>
			{/if}
		</div>
	</div>
{/if}
