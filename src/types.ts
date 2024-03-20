export type Container = {
	name: string;
	color?: string;
	icon?: string;
	cb: (container: browser.contextualIdentities.ContextualIdentity) => void;
};

export type Details = {
	requestId: string;
};

export type AccountFilterResponse = {
	result: AccountFilterResult[];
};

export type AccountFilterResult = {
	searchMetadata?: { AccountId: string; AccountName: string };
};
