const settings = require('./settings');
const chalk = require('chalk');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const { handleMessages } = require('./main');
const { generateSessionId, saveSession, loadSession } = require('./utils');
const { exec } = require('child_process');
const NodeCache = require('node-cache');
const EventEmitter = require('events');
const msgRetryCounterCache = new NodeCache();
const http = require('http');
const { isWelcomeOn, isGoodByeOn } = require('./sql');
const dns = require('dns');
const { promisify } = require('util');
const lookup = promisify(dns.lookup);
const resolve4 = promisify(dns.resolve4);

// Increase event listener limit
EventEmitter.defaultMaxListeners = 2000;
process.setMaxListeners(2000);

// Global settings
global.packname = settings.packname;
global.author = settings.author;
global.channelLink = "https://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A";
global.ytch = "Mr Unique Hacker";

// Custom logger
const logger = P({
    level: 'silent',
    enabled: false
});

// Console output helper
const printLog = {
    info: (msg) => console.log(chalk.cyan(`\n[i] ${msg}`)),
    success: (msg) => console.log(chalk.green(`\n[✓] ${msg}`)),
    warn: (msg) => console.log(chalk.yellow(`\n[!] ${msg}`)),
    error: (msg) => console.log(chalk.red(`\n[x] ${msg}`))
};

// Connection state management
let connectionState = {
    isConnected: false,
    qrDisplayed: false,
    retryCount: 0,
    sessionExists: false,
    lastPing: Date.now(),
    sessionId: process.env.SESSION_ID || null,
    isClosing: false,
    sock: null
};

// Add this near your useMultiFileAuthState call
const sessionPath = './session';

// Add debug logging
const checkSessionFiles = () => {
    try {
        const files = fs.readdirSync(sessionPath);
        printLog.info('Current session files: ' + files.join(', '));
    } catch (err) {
        printLog.error('Error reading session directory:', err);
    }
};

// Add this helper function to handle session cleanup
const cleanupSession = async (sock, jid) => {
    try {
        const sessionPath = `./session/session-${jid}.json`;
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            printLog.info(`Cleaned up session for ${jid}`);
        }
    } catch (err) {
        printLog.error(`Error cleaning up session: ${err}`);
    }
};

// Add this function before startConnection()
async function setupDNS() {
    try {
        // Try to resolve WhatsApp's domain first
        const ips = await resolve4('web.whatsapp.com');
        if (ips && ips.length > 0) {
            // Add entries to hosts file in memory
            dns.setServers(['8.8.8.8', '1.1.1.1']); // Use Google and Cloudflare DNS
            printLog.info('DNS Setup completed successfully');
            return true;
        }
    } catch (error) {
        printLog.error('DNS Setup failed:', error);
        return false;
    }
}

// Automatic reconnection function
async function startConnection() {
    try {
        // Setup DNS before connecting
        const dnsSetup = await setupDNS();
        if (!dnsSetup) {
            printLog.warn('DNS setup failed, retrying in 5 seconds...');
            setTimeout(startConnection, 5000);
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        
        // Add error handling for decryption failures
        const handleDecryptionError = async (error, m) => {
            if (error.message.includes('Bad MAC')) {
                printLog.warn(`Decryption failed for message from ${m.key.remoteJid}`);
                await cleanupSession(sock, m.key.remoteJid.split('@')[0]);
                return;
            }
            throw error;
        };

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: true,
            logger,
            browser: Browsers.ubuntu('Chrome'),
            version,
            connectTimeoutMs: 60_000, // Increase timeout
            retryRequestDelayMs: 5000,
            msgRetryCounterCache,
            // Add these new connection options
            options: {
                headers: {
                    'User-Agent': 'WhatsApp/2.2323.4 Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                },
                timeout: 60000,
                agent: null // Let Node handle the connection
            },
            // Add custom DNS resolver
            customDNSResolver: async (hostname) => {
                try {
                    const { address } = await lookup(hostname);
                    return [address];
                } catch (error) {
                    printLog.error(`DNS resolution failed for ${hostname}:`, error);
                    throw error;
                }
            },
            fetchAgent: {
                lookup: async (hostname, options, callback) => {
                    try {
                        const addresses = await dns.promises.resolve4(hostname);
                        if (addresses && addresses.length > 0) {
                            callback(null, addresses[0], 4);
                        } else {
                            if (hostname === 'web.whatsapp.com') {
                                callback(null, '157.240.196.35', 4);
                            } else {
                                callback(new Error('DNS resolution failed'), null);
                            }
                        }
                    } catch (err) {
                        if (hostname === 'web.whatsapp.com') {
                            callback(null, '157.240.196.35', 4);
                        } else {
                            callback(err, null);
                        }
                    }
                }
            },
            syncFullHistory: true,
            defaultQueryTimeoutMs: 30000,
            markOnlineOnConnect: false,
            fireInitQueries: true,
            emitOwnEvents: true,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                if (store) {
                    try {
                        const msg = await store.loadMessage(key.remoteJid, key.id);
                        return msg?.message || undefined;
                    } catch (error) {
                        await handleDecryptionError(error, { key });
                        return {
                            conversation: "Message decryption failed"
                        };
                    }
                }
                return {
                    conversation: "An Error Occurred, Repeat Command!"
                };
            },
            patchMessageBeforeSending: (message) => {
                const requiresPatch = !!(
                    message.buttonsMessage ||
                    message.templateMessage ||
                    message.listMessage ||
                    message.scheduledCallCreationMessage ||
                    message.callLogMesssage
                );
                if (requiresPatch) {
                    message = {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadataVersion: 2,
                                    deviceListMetadata: {},
                                },
                                ...message,
                            },
                        },
                    };
                }
                return message;
            }
        });

        connectionState.sock = sock;

        // Register group participants event handler ONCE
        sock.ev.on('group-participants.update', async (update) => {
            try {
                const { id, participants, action } = update;
                
                // Check if welcome/goodbye is enabled for this group
                const isWelcomeEnabled = await isWelcomeOn(id);
                const isGoodbyeEnabled = await isGoodByeOn(id);

                if (action === 'add' && isWelcomeEnabled) {
                    // Get participant names
                    const participantNames = await Promise.all(participants.map(async (jid) => {
                        try {
                            const contact = await sock.contactQuery(jid);
                            return {
                                mention: `@${jid.split('@')[0]}`,
                                name: contact.pushName || contact.notify || jid.split('@')[0]
                            };
                        } catch (err) {
                            return {
                                mention: `@${jid.split('@')[0]}`,
                                name: jid.split('@')[0]
                            };
                        }
                    }));

                    // Create welcome message with names
                    const welcomeText = `Welcome ${participantNames.map(p => p.name).join(', ')} to the group! 🎉`;

                    await sock.sendMessage(id, {
                        text: welcomeText,
                        mentions: participants,
                        contextInfo: {
                            forwardingScore: 999,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363161513685998@newsletter',
                                newsletterName: 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    });
                } else if (action === 'remove' && isGoodbyeEnabled) {
                    // Get participant names for goodbye message
                    const participantNames = await Promise.all(participants.map(async (jid) => {
                        try {
                            const contact = await sock.contactQuery(jid);
                            return {
                                mention: `@${jid.split('@')[0]}`,
                                name: contact.pushName || contact.notify || jid.split('@')[0]
                            };
                        } catch (err) {
                            return {
                                mention: `@${jid.split('@')[0]}`,
                                name: jid.split('@')[0]
                            };
                        }
                    }));

                    // Create goodbye message with names
                    const goodbyeText = `Goodbye ${participantNames.map(p => p.name).join(', ')} 👋`;

                    await sock.sendMessage(id, {
                        text: goodbyeText,
                        mentions: participants,
                        contextInfo: {
                            forwardingScore: 999,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363161513685998@newsletter',
                                newsletterName: 'KnightBot MD',
                                serverMessageId: -1
                            }
                        }
                    });
                }
            } catch (error) {
                console.error('Error in group-participants.update handler:', error);
            }
        });

        // Connection update event handler
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                printLog.warn(`Connection closed due to ${lastDisconnect?.error?.message}`);
                
                if (shouldReconnect) {
                    // Try DNS setup again before reconnecting
                    await setupDNS();
                    setTimeout(startConnection, 3000);
                }
            } else if (connection === 'connecting') {
                printLog.info('Connecting to WhatsApp...');
            } else if (connection === 'open') {
                printLog.success('Connected to WhatsApp');
                connectionState.isConnected = true;
                connectionState.retryCount = 0;
            }
        });

        // Add logging to creds.update
        sock.ev.on('creds.update', async () => {
            await saveCreds();
            printLog.info('Credentials updated, checking files...');
            checkSessionFiles();
        });

        // Handle messages
        sock.ev.on('messages.upsert', async (messageUpdate) => {
            if (connectionState.isConnected) {
                try {
                    await handleMessages(sock, messageUpdate);
                } catch (error) {
                    if (error.message.includes('Bad MAC')) {
                        const jid = messageUpdate.messages[0]?.key?.remoteJid;
                        if (jid) {
                            await cleanupSession(sock, jid.split('@')[0]);
                            printLog.warn(`Session reset for ${jid} due to decryption error`);
                        }
                    } else {
                        console.error('Error in message handler:', error);
                    }
                }
            }
        });

        // Handle errors
        sock.ev.on('error', async (error) => {
            printLog.error('Connection error:', error);
            if (!connectionState.isClosing) {
                setTimeout(startConnection, 3000);
            }
        });

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            connectionState.isClosing = true;
            printLog.warn('Received shutdown signal');
            printLog.info('Closing connection...');
            if (connectionState.sock) {
                await connectionState.sock.end();
            }
            process.exit(0);
        });

        // Handle uncaught errors
        process.on('uncaughtException', (err) => {
            printLog.error('Uncaught Exception:', err);
            if (!connectionState.isClosing) {
                setTimeout(startConnection, 3000);
            }
        });

        process.on('unhandledRejection', (err) => {
            printLog.error('Unhandled Rejection:', err);
            if (!connectionState.isClosing) {
                setTimeout(startConnection, 3000);
            }
        });

    } catch (err) {
        printLog.error('Fatal error:', err);
        if (!connectionState.isClosing) {
            // Try DNS setup again before reconnecting
            await setupDNS();
            setTimeout(startConnection, 5000);
        }
    }
}

// Start the bot
startConnection();

// Add this near the bottom of the file, before startConnection()
const server = http.createServer((req, res) => {
    dns.resolve4('web.whatsapp.com', (err, addresses) => {
        if (err) {
            res.writeHead(500);
            res.end('DNS resolution failed');
        } else {
            res.writeHead(200);
            res.end('Bot is running! DNS resolution successful');
        }
    });
});

server.listen(7860, () => {
    printLog.info('Health check server running on port 7860');
});