const settings = require('./settings');
const chalk = require('chalk');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const http = require('http');
const dns = require('dns');
const { promisify } = require('util');

const lookup = promisify(dns.lookup);
const resolve4 = promisify(dns.resolve4);

// Logger setup
const printLog = {
    info: (msg) => console.log(chalk.cyan(`\n[i] ${msg}`)),
    success: (msg) => console.log(chalk.green(`\n[✓] ${msg}`)),
    warn: (msg) => console.log(chalk.yellow(`\n[!] ${msg}`)),
    error: (msg) => console.log(chalk.red(`\n[x] ${msg}`))
};

// Connection state
let connectionState = {
    isConnected: false,
    retryCount: 0,
    sock: null
};

// Session directory
const sessionPath = './session';

// Setup DNS with fallback
async function setupDNS() {
    try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        const ips = await resolve4('web.whatsapp.com');
        if (ips && ips.length > 0) {
            printLog.success(`DNS Setup completed successfully with IPs: ${ips.join(', ')}`);
            return true;
        }
    } catch (error) {
        printLog.error(`DNS Setup failed: ${error.code}`);
        printLog.warn(`Using fallback IP for WhatsApp.`);
        global.WHATSAPP_IP = '157.240.22.54';
        return true; // Continue even if DNS resolution fails
    }
    return false;
}

// Custom DNS Resolver with retries
const customDNSResolve = async (hostname) => {
    const dnsServers = ['8.8.8.8', '1.1.1.1'];
    for (const server of dnsServers) {
        try {
            dns.setServers([server]);
            const addresses = await dns.promises.resolve4(hostname);
            if (addresses && addresses.length > 0) {
                printLog.success(`Resolved ${hostname} to ${addresses[0]} using ${server}`);
                return addresses[0];
            }
        } catch (e) {
            printLog.warn(`DNS resolution failed using ${server}, trying next...`);
        }
    }
    if (hostname === 'web.whatsapp.com') {
        return '157.240.22.54';
    }
    throw new Error(`DNS resolution failed for ${hostname}`);
};

// Start WhatsApp connection
async function startConnection() {
    try {
        let dnsSetupSuccess = false;
        for (let i = 0; i < 3; i++) {
            dnsSetupSuccess = await setupDNS();
            if (dnsSetupSuccess) break;
            printLog.warn(`DNS setup failed, retrying (${i + 1}/3)...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (!dnsSetupSuccess) {
            printLog.error('All DNS setup attempts failed. Exiting...');
            process.exit(1);
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys)
            },
            printQRInTerminal: true,
            logger: P({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
            version,
            fetchAgent: {
                lookup: async (hostname, options, callback) => {
                    try {
                        const address = await customDNSResolve(hostname);
                        callback(null, address, 4);
                    } catch (err) {
                        callback(err, null);
                    }
                }
            }
        });

        connectionState.sock = sock;
        printLog.success('Connected to WhatsApp successfully!');

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                printLog.warn('Connection closed, reconnecting...');
                setTimeout(startConnection, 5000);
            } else if (connection === 'open') {
                printLog.success('Connection established');
                connectionState.isConnected = true;
            }
        });

    } catch (err) {
        printLog.error(`Fatal error: ${err.message}`);
        setTimeout(startConnection, 5000);
    }
}

// Health check server
const server = http.createServer(async (req, res) => {
    try {
        const addresses = await dns.promises.resolve4('web.whatsapp.com');
        res.writeHead(200);
        res.end(`Bot is running! DNS resolution successful: ${addresses.join(', ')}`);
    } catch (err) {
        printLog.error('DNS health check failed:', err.message);
        res.writeHead(500);
        res.end('DNS health check failed: ' + err.message);
    }
});

server.listen(7860, () => {
    printLog.info('Health check server running on port 7860');
});

// Start bot connection
startConnection();
