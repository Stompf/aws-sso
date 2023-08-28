export type Container = {
	name: string;
	color?: string;
	icon?: string;
	cb: (container: browser.contextualIdentities.ContextualIdentity) => void;
};
