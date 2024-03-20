import { AccountFilterResponse, Container, Details } from "./types";

// Container code mostly taken from
// https://github.com/honsiorovskyi/open-url-in-container
const availableContainerIcons = [
	"fingerprint",
	"briefcase",
	"dollar",
	"cart",
	"circle",
	"gift",
	"vacation",
	"food",
	"fruit",
	"pet",
	"tree",
	"chill",
	"fence",
];

const availableContainerColors = [
	"blue",
	"turquoise",
	"green",
	"yellow",
	"orange",
	"red",
	"pink",
	"purple",
];

const accountNameMap: Record<string, string> = {};

function randomIcon() {
	return availableContainerIcons[(Math.random() * availableContainerIcons.length) | 0];
}

function getColor(name: string) {
	if (["prod", "production"].some((el) => name.includes(el))) {
		return "red";
	}

	if (["stage"].some((el) => name.includes(el))) {
		return "yellow";
	}

	if (["dev", "development"].some((el) => name.includes(el))) {
		return "green";
	}

	return availableContainerColors[(Math.random() * availableContainerColors.length) | 0];
}

async function prepareContainer({ name, cb }: Container) {
	const containers = await browser.contextualIdentities.query({
		name: name,
	});

	if (containers.length >= 1) {
		cb(containers[0]);
	} else {
		const container = await browser.contextualIdentities.create({
			name: name,
			color: getColor(name.toLowerCase()),
			icon: randomIcon(),
		});
		cb(container);
	}
}

function listener(details: browser.webRequest._OnBeforeRequestDetails) {
	// If we're in a container already, skip
	if (details.cookieStoreId !== "firefox-default") {
		return {};
	}
	if (!details.originUrl) {
		throw new Error("missing originUrl");
	}

	const filter = browser.webRequest.filterResponseData(details.requestId);
	const queryString = new URLSearchParams(details.url.split("?")[1]);
	const accountRole = queryString.get("role_name");
	const accountNumber = queryString.get("account_id");

	let str = "";
	const decoder = new TextDecoder("utf-8");
	const encoder = new TextEncoder();

	filter.ondata = ({ data }) => {
		str += decoder.decode(data, { stream: true });
	};

	filter.onstop = () => {
		if (str.length > 0) {
			const object = JSON.parse(str);

			if (object.signInToken) {
				let destination = object.destination;
				if (!destination) {
					destination = "https://console.aws.amazon.com";
				}

				if (!details.originUrl) {
					throw new Error("missing originUrl in onstop event");
				}

				// Generate our federation URI and open it in a container
				const url = `${object.signInFederationLocation}?Action=login&SigninToken=${
					object.signInToken
				}&Issuer=${encodeURIComponent(details.originUrl)}&Destination=${encodeURIComponent(
					destination,
				)}`;

				if (!accountNumber) {
					throw new Error("missing accountNumber");
				}

				prepareContainer({
					name: `${accountNameMap[accountNumber]} ${accountRole}`,
					cb: ({ cookieStoreId }) => {
						const createTabParams = {
							cookieStoreId,
							url: url,
							pinned: false,
						};

						browser.tabs.create(createTabParams);
						browser.tabs.remove(details.tabId);
					},
				});
			} else {
				filter.write(encoder.encode(str));
			}
		}
		filter.close();
	};
}

function accountNameListener(details: Details) {
	const filter = browser.webRequest.filterResponseData(details.requestId);

	let str = "";
	const decoder = new TextDecoder("utf-8");
	const encoder = new TextEncoder();

	filter.ondata = (event) => {
		str += decoder.decode(event.data, { stream: true });
	};
	filter.onstop = () => {
		filter.write(encoder.encode(str));
		if (str.length > 0) {
			const object: AccountFilterResponse = JSON.parse(str);

			for (const result of object.result) {
				if (result.searchMetadata) {
					accountNameMap[result.searchMetadata.AccountId] = result.searchMetadata.AccountName;
				}
			}
		}
		filter.close();
	};

	return {};
}

browser.webRequest.onBeforeRequest.addListener(
	listener,
	{
		urls: ["https://*.amazonaws.com/federation/console?*"],
		types: ["xmlhttprequest"],
	},
	["blocking"],
);

browser.webRequest.onBeforeRequest.addListener(
	accountNameListener,
	{
		urls: ["https://*.amazonaws.com/instance/appinstances"],
		types: ["xmlhttprequest"],
	},
	["blocking"],
);
