export const COMMAND_PALETTE_DISCOVER_CHANNEL = "kostya:command-palette-discover";
export const COMMAND_PALETTE_RUN_CHANNEL = "kostya:command-palette-run";

export type ExternalCommandPaletteAction = {
	id: string;
	label: string;
	description?: string;
	source: string;
};

export type CommandPaletteDiscoverEvent = {
	add: (items: ExternalCommandPaletteAction[]) => void;
};

export type CommandPaletteRunEvent = {
	id: string;
};
