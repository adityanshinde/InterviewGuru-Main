/** Best-effort: stop a running InterviewGuru.exe so electron-builder can overwrite the output (Windows only). */
import { execSync } from 'node:child_process';

if (process.platform === 'win32') {
	try {
		execSync('taskkill /F /IM InterviewGuru.exe', { stdio: 'ignore' });
	} catch {
		/* not running */
	}
}
