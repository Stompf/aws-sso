import { Container } from "./types";

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

function randomIcon() {
	return availableContainerIcons[(Math.random() * availableContainerIcons.length) | 0];
}

function randomColor() {
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
			color: randomColor(),
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

	const accountRole = details.url.split("=")[2];
	const account = decodeURIComponent(details.originUrl.split("/")[7]);
	const accountName = account.split("(")[1].slice(0, -1);

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
				prepareContainer({
					name: `${accountName} ${accountRole}`,
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

browser.webRequest.onBeforeRequest.addListener(
	listener,
	{
		urls: ["https://*.amazonaws.com/federation/console?*"],
		types: ["xmlhttprequest"],
	},
	["blocking"],
);
