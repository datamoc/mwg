const os = require('node:os');

//Capacitor's terminal helper calls userInfo at module load. Some Windows Node 26 hosts
//return ENOMEM there even though the environment already exposes the needed account data.
try {
	os.userInfo();
} catch (error) {
	if (error?.syscall !== 'uv_os_get_passwd') throw error;
	os.userInfo = () => ({
		uid: -1,
		gid: -1,
		username: process.env.USERNAME || 'unknown',
		homedir: process.env.USERPROFILE || process.cwd(),
		shell: process.env.COMSPEC || null,
	});
}
