<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { page } from '$app/stores';
	import { getFolderById } from '$lib/apis/folders';
	import Chat from '$lib/components/chat/Chat.svelte';
	import {
		config,
		models,
		selectedFolder,
		settings,
		showCallOverlay,
		showControls,
		showSidebar
	} from '$lib/stores';
	import { toast } from 'svelte-sonner';

	let chatReady = false;
	let chatVisible = false;
	let chatPane: HTMLDivElement | null = null;

	let dragging = false;
	let resizing = false;
	let dragOffsetX = 0;
	let dragOffsetY = 0;
	let startWidth = 0;
	let startHeight = 0;
	let startClientX = 0;
	let startClientY = 0;

	let chatRect = {
		x: 24,
		y: 96,
		w: 460,
		h: 640
	};

	const MIN_WIDTH = 360;
	const MIN_HEIGHT = 420;
	const MARGIN = 16;
	const VOICE_ROUTE_MODEL_STORAGE_KEY = 'voiceRouteModelId';

	const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

	const getViewportRect = () => ({
		width: window.innerWidth,
		height: window.innerHeight
	});

	const normalizeChatRect = () => {
		const viewport = getViewportRect();
		const maxWidth = Math.max(MIN_WIDTH, viewport.width - MARGIN * 2);
		const maxHeight = Math.max(MIN_HEIGHT, viewport.height - MARGIN * 2);

		chatRect.w = clamp(chatRect.w, MIN_WIDTH, maxWidth);
		chatRect.h = clamp(chatRect.h, MIN_HEIGHT, maxHeight);
		chatRect.x = clamp(chatRect.x, MARGIN, viewport.width - chatRect.w - MARGIN);
		chatRect.y = clamp(chatRect.y, MARGIN, viewport.height - chatRect.h - MARGIN);
	};

	const applyChatPaneLayout = async () => {
		await tick();
		chatPane = document.getElementById('chat-pane') as HTMLDivElement | null;
		if (!chatPane) return;

		normalizeChatRect();

		chatPane.style.left = `${chatRect.x}px`;
		chatPane.style.top = `${chatRect.y}px`;
		chatPane.style.width = `${chatRect.w}px`;
		chatPane.style.height = `${chatRect.h}px`;
	};

	const collapseDesktopControlsPane = async () => {
		await tick();
		const controlsContainer = document.getElementById('controls-container');
		const controlsPane = controlsContainer?.closest('[data-pane]') as HTMLDivElement | null;
		if (!controlsPane) return;

		controlsPane.style.flex = '0 0 0px';
		controlsPane.style.width = '0px';
		controlsPane.style.minWidth = '0px';
		controlsPane.style.overflow = 'visible';
		controlsPane.style.background = 'transparent';
		controlsPane.style.border = '0';
		controlsPane.style.boxShadow = 'none';
	};

	const getVisibleModelIds = () =>
		($models ?? [])
			.filter((model) => !(model?.info?.meta?.hidden ?? false))
			.map((model) => model.id)
			.filter(Boolean);

	const resolvePreferredVoiceModelId = () => {
		const visibleModelIds = getVisibleModelIds();
		if (visibleModelIds.length === 0) return '';

		const urlModel =
			($page.url.searchParams.get('model') || $page.url.searchParams.get('models') || '')
				.split(',')
				.map((id) => id.trim())
				.find((id) => visibleModelIds.includes(id)) ?? '';
		if (urlModel) return urlModel;

		const savedVoiceModel = localStorage.getItem(VOICE_ROUTE_MODEL_STORAGE_KEY) ?? '';
		if (savedVoiceModel && visibleModelIds.includes(savedVoiceModel)) {
			return savedVoiceModel;
		}

		const preferredSettingsModel = ($settings?.models ?? []).find((id) => visibleModelIds.includes(id));
		if (preferredSettingsModel) return preferredSettingsModel;

		const defaultModels = ($config?.default_models ?? '')
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean);
		const preferredDefaultModel = defaultModels.find((id) => visibleModelIds.includes(id));
		if (preferredDefaultModel) return preferredDefaultModel;

		return visibleModelIds[0] ?? '';
	};

	const prepareVoiceRouteModel = () => {
		const preferredModelId = resolvePreferredVoiceModelId();
		if (!preferredModelId) return '';

		sessionStorage.selectedModels = JSON.stringify([preferredModelId]);
		localStorage.setItem(VOICE_ROUTE_MODEL_STORAGE_KEY, preferredModelId);
		return preferredModelId;
	};

	const resolveFolderFromUrl = async () => {
		const folderId = ($page.url.searchParams.get('folder') || '').trim();
		if (!folderId) {
			selectedFolder.set(null);
			return null;
		}

		const folder = await getFolderById(localStorage.token, folderId).catch((error) => {
			console.error('Failed to load folder from URL:', error);
			return null;
		});

		if (folder?.id) {
			await selectedFolder.set(folder);
			return folder;
		}

		toast.error('Folder not found or inaccessible.');
		selectedFolder.set(null);
		return null;
	};

	const openVoiceMode = async () => {
		showSidebar.set(false);
		await tick();

		// Re-apply a few times because Chat/ChatControls bind asynchronously.
		[0, 150, 500].forEach((delay) => {
			setTimeout(() => {
				showCallOverlay.set(true);
				showControls.set(true);
				collapseDesktopControlsPane();
			}, delay);
		});
	};

	const toggleChat = async () => {
		chatVisible = !chatVisible;
		if (chatVisible) {
			await applyChatPaneLayout();
		}
	};

	const closeChat = () => {
		chatVisible = false;
	};

	const resizeToViewport = async () => {
		normalizeChatRect();
		await applyChatPaneLayout();
	};

	const beginDrag = (event: MouseEvent) => {
		if (!chatVisible) return;

		const target = event.target as HTMLElement | null;
		if (!target) return;
		if (target.closest('button, a, input, textarea, select, [role="button"], [data-no-drag="true"]')) {
			return;
		}

		dragging = true;
		dragOffsetX = event.clientX - chatRect.x;
		dragOffsetY = event.clientY - chatRect.y;
		event.preventDefault();
	};

	const beginResize = (event: MouseEvent) => {
		if (!chatVisible) return;

		resizing = true;
		startWidth = chatRect.w;
		startHeight = chatRect.h;
		startClientX = event.clientX;
		startClientY = event.clientY;
		event.preventDefault();
		event.stopPropagation();
	};

	const handlePointerMove = async (event: MouseEvent) => {
		if (dragging) {
			const viewport = getViewportRect();
			chatRect.x = clamp(event.clientX - dragOffsetX, MARGIN, viewport.width - chatRect.w - MARGIN);
			chatRect.y = clamp(event.clientY - dragOffsetY, MARGIN, viewport.height - chatRect.h - MARGIN);
			await applyChatPaneLayout();
		} else if (resizing) {
			const viewport = getViewportRect();
			const maxWidth = Math.max(MIN_WIDTH, viewport.width - chatRect.x - MARGIN);
			const maxHeight = Math.max(MIN_HEIGHT, viewport.height - chatRect.y - MARGIN);

			chatRect.w = clamp(startWidth + (event.clientX - startClientX), MIN_WIDTH, maxWidth);
			chatRect.h = clamp(startHeight + (event.clientY - startClientY), MIN_HEIGHT, maxHeight);
			await applyChatPaneLayout();
		}
	};

	const handlePointerUp = () => {
		dragging = false;
		resizing = false;
	};

	onMount(async () => {
		document.body.classList.add('voice-route');
		await resolveFolderFromUrl();
		prepareVoiceRouteModel();
		chatReady = true;
		await tick();
		await openVoiceMode();
		await applyChatPaneLayout();
		await collapseDesktopControlsPane();

		const bindDragHandle = async () => {
			await tick();
			const dragHandle = document.getElementById('chat-navbar');
			dragHandle?.addEventListener('mousedown', beginDrag);
			return () => dragHandle?.removeEventListener('mousedown', beginDrag);
		};

		let unbindDragHandle = await bindDragHandle();

		const rebindTimer = setTimeout(async () => {
			unbindDragHandle?.();
			unbindDragHandle = await bindDragHandle();
			await collapseDesktopControlsPane();
		}, 1000);

		window.addEventListener('mousemove', handlePointerMove);
		window.addEventListener('mouseup', handlePointerUp);
		window.addEventListener('resize', resizeToViewport);

		return () => {
			clearTimeout(rebindTimer);
			unbindDragHandle?.();
			window.removeEventListener('mousemove', handlePointerMove);
			window.removeEventListener('mouseup', handlePointerUp);
			window.removeEventListener('resize', resizeToViewport);
		};
	});

	onDestroy(() => {
		document.body.classList.remove('voice-route');
	});
</script>

<div class:chat-open={chatVisible} class="voice-route-shell">
	{#if chatReady}
		<Chat />
	{/if}

	<button
		type="button"
		class="voice-toggle notebook-primary-button"
		aria-label={chatVisible ? 'Hide chat' : 'Show chat'}
		title={chatVisible ? 'Hide chat' : 'Show chat'}
		on:click={toggleChat}
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5">
			<path
				fill-rule="evenodd"
				d="M4.804 21.644A6.375 6.375 0 0 1 2.25 16.5V6.75A2.25 2.25 0 0 1 4.5 4.5h15A2.25 2.25 0 0 1 21.75 6.75v9.75a2.25 2.25 0 0 1-2.25 2.25H8.914l-4.11 2.74Zm3.946-8.769a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0-3.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>

	{#if chatVisible}
		<button
			type="button"
			class="voice-chat-close notebook-icon-button"
			aria-label="Hide chat"
			title="Hide chat"
			data-no-drag="true"
			on:click={closeChat}
			style={`left:${chatRect.x + chatRect.w - 46}px; top:${chatRect.y + 10}px;`}
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
				<path
					d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
				/>
			</svg>
		</button>

		<button
			type="button"
			class="voice-chat-resizer notebook-icon-button"
			aria-label="Resize chat window"
			title="Resize chat window"
			data-no-drag="true"
			on:mousedown={beginResize}
			style={`left:${chatRect.x + chatRect.w - 18}px; top:${chatRect.y + chatRect.h - 18}px;`}
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3.5">
				<path
					d="M5.97 6.97a.75.75 0 0 1 1.06 0L10 9.94l2.97-2.97a.75.75 0 1 1 1.06 1.06L11.06 11l2.97 2.97a.75.75 0 1 1-1.06 1.06L10 12.06l-2.97 2.97a.75.75 0 0 1-1.06-1.06L8.94 11 5.97 8.03a.75.75 0 0 1 0-1.06Z"
				/>
			</svg>
		</button>
	{/if}
</div>

<style>
	.voice-route-shell {
		position: relative;
		min-height: 100dvh;
	}

	.voice-toggle {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		z-index: 80;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		border-radius: 9999px;
	}

	.voice-chat-close,
	.voice-chat-resizer {
		position: fixed;
		z-index: 82;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
	}

	.voice-chat-resizer {
		cursor: nwse-resize;
	}

	:global(.voice-route .app),
	:global(.voice-route #chat-container) {
		height: 100dvh;
		max-height: 100dvh;
	}

	:global(.voice-route #chat-container) {
		padding: 0;
	}

	:global(.voice-route #chat-container::before) {
		display: none;
	}

	:global(.voice-route #controls-resizer) {
		display: none !important;
	}

	:global(.voice-route #controls-container) {
		position: fixed !important;
		inset: 0 !important;
		width: 100vw !important;
		height: 100dvh !important;
		background: transparent !important;
		box-shadow: none !important;
		z-index: 30 !important;
	}

	:global(.voice-route #chat-pane) {
		position: fixed !important;
		left: 24px;
		top: 96px;
		width: 460px;
		height: 640px;
		max-width: calc(100vw - 32px);
		max-height: calc(100dvh - 32px);
		z-index: 70 !important;
		overflow: hidden !important;
		border-radius: 1.75rem !important;
		box-shadow: 0 28px 70px rgba(18, 33, 41, 0.22) !important;
		transition:
			opacity 180ms ease,
			visibility 180ms ease;
	}

	:global(.voice-route #chat-navbar) {
		cursor: move;
	}

	:global(.voice-route #chat-navbar button),
	:global(.voice-route #chat-navbar a),
	:global(.voice-route #chat-navbar input),
	:global(.voice-route #chat-navbar select) {
		cursor: pointer;
	}

	:global(.voice-route #chat-pane .grain-overlay::after) {
		opacity: 0.05;
	}

	:global(.voice-route-shell:not(.chat-open) #chat-pane) {
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
	}

	@media (max-width: 767px) {
		.voice-toggle {
			right: 0.75rem;
			bottom: 0.75rem;
		}

		:global(.voice-route #chat-pane) {
			left: 12px !important;
			top: 76px !important;
			width: calc(100vw - 24px) !important;
			height: min(68dvh, 640px) !important;
			max-height: calc(100dvh - 88px) !important;
		}
	}
</style>
