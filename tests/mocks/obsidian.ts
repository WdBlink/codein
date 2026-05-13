export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export function requestUrl(): never {
	throw new Error("requestUrl must be mocked in tests.");
}
