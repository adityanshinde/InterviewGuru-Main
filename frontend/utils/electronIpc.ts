/**
 * Electron IPC: preload bridge (remote https origin) or legacy nodeIntegration (local dev).
 */
export type ElectronIpcLike = {
	send: (channel: string, ...args: unknown[]) => void;
	invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
	on: (channel: string, callback: (...args: unknown[]) => void) => void;
	removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
};

export function getElectronIpc(): ElectronIpcLike | null {
	const win = window as unknown as {
		interviewGuruElectron?: {
			send: (c: string, ...a: unknown[]) => void;
			invoke: (c: string, ...a: unknown[]) => Promise<unknown>;
			on: (c: string, cb: () => void) => void;
			removeListener: (c: string, cb: () => void) => void;
		};
		require?: (m: string) => { ipcRenderer: ElectronIpcLike };
		electron?: { ipcRenderer: ElectronIpcLike };
		ipcRenderer?: ElectronIpcLike;
	};

	if (win.interviewGuruElectron) {
		const b = win.interviewGuruElectron;
		return {
			send: (c, ...a) => b.send(c, ...a),
			invoke: (c, ...a) => b.invoke(c, ...a),
			on: (c, cb) => b.on(c, cb as () => void),
			removeListener: (c, cb) => b.removeListener(c, cb as () => void),
		};
	}

	try {
		if (win.require) {
			return win.require('electron').ipcRenderer;
		}
	} catch {
		/* not Electron */
	}
	if (win.electron?.ipcRenderer) return win.electron.ipcRenderer;
	if (win.ipcRenderer) return win.ipcRenderer;
	return null;
}
