const isNode = typeof window === 'undefined';
const runtimeEnv = /** @type {ImportMetaEnv} */ (import.meta.env || {});
const memoryValues = new Map();
const memoryStorage = {
	getItem: (key) => memoryValues.get(key) ?? null,
	setItem: (key, value) => memoryValues.set(key, String(value)),
	removeItem: (key) => memoryValues.delete(key),
};
const browserStorage = (() => {
	if (isNode) return memoryStorage;
	try { return window.localStorage; } catch { return memoryStorage; }
})();
const storage = {
	getItem(key) { try { return browserStorage.getItem(key); } catch { return memoryStorage.getItem(key); } },
	setItem(key, value) {
		try { browserStorage.setItem(key, value); }
		catch { memoryStorage.setItem(key, value); }
	},
	removeItem(key) {
		try { browserStorage.removeItem(key); }
		catch { memoryStorage.removeItem(key); }
	},
};
const DEFAULT_APP_ID = '6a841dff26d5042e4adf890e';
const DEFAULT_SERVER_URL = 'https://base44.app';

const normalizeUrl = (value, fallback) => {
	const candidate = typeof value === 'string' && value.trim() ? value.trim() : fallback;
	return candidate.replace(/\/+$/, '');
};

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
	}
	const serverUrl = normalizeUrl(runtimeEnv.VITE_BASE44_SERVER_URL, DEFAULT_SERVER_URL);
	const appBaseUrl = normalizeUrl(runtimeEnv.VITE_BASE44_APP_BASE_URL, serverUrl);
	return {
		appId: getAppParamValue("app_id", { defaultValue: runtimeEnv.VITE_BASE44_APP_ID || DEFAULT_APP_ID }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: isNode ? '' : window.location.href }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: runtimeEnv.VITE_BASE44_FUNCTIONS_VERSION }),
		serverUrl,
		appBaseUrl,
	}
}


export const appParams = {
	...getAppParams()
}
