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

// Automatic reconnection function
const startConnection = async () => {
    try {
        // Log before auth state
        printLog.info('Checking session directory...');
        checkSessionFiles();

        const { version } = await fetchLatestBaileysVersion();
        printLog.info(`Using WA v${version.join('.')}, isLatest: ${version}`);

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        // Log after auth state
        printLog.info('After auth state initialization...');
        checkSessionFiles();

        // Updated Socket configuration
        const config = {
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: true,
            logger,
            browser: Browsers.windows('Desktop'),
            version,
            keepAliveIntervalMs: 5000,
            syncFullHistory: true,
            defaultQueryTimeoutMs: 30000,
            retryRequestDelayMs: 5000,
            markOnlineOnConnect: false,
            fireInitQueries: true,
            emitOwnEvents: true,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
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
        };

        const sock = makeWASocket(config);
        connectionState.sock = sock;

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                if (!connectionState.qrDisplayed) {
                    connectionState.qrDisplayed = true;
                    printLog.info('Scan QR Code to connect');
                }
            }

            if (connection === 'connecting') {
                printLog.info('Connecting to WhatsApp...');
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                printLog.warn(`Connection closed due to ${lastDisconnect?.error?.message}`);
                
                if (shouldReconnect) {
                    printLog.info('Reconnecting...');
                    setTimeout(startConnection, 3000);
                } else {
                    printLog.error('Connection closed. You are logged out.');
                    process.exit(0);
                }
            }

            if (connection === 'open') {
                connectionState.isConnected = true;
                connectionState.qrDisplayed = false;
                printLog.success('Bot Connected Successfully!');
                
                // Generate or use existing session ID
                if (!connectionState.sessionId) {
                    connectionState.sessionId = generateSessionId();
                }
                
                printLog.success(`Session ID: ${connectionState.sessionId}`);

                // Send connection message
                try {
                    await sock.sendMessage(sock.user.id, {
                        text: `🤖 *KnightBot Connected*\n\nSession ID: ${connectionState.sessionId}`
                    });
                } catch (err) {}

                // Keep connection alive
                setInterval(async () => {
                    try {
                        await sock.sendPresenceUpdate('available');
                    } catch (err) {}
                }, 10000);
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
                    console.error('Error in message handler:', error);
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
            setTimeout(startConnection, 3000);
        }
    }
};

// Start the bot
startConnection();

// Add this near the bottom of the file, before startConnection()
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running!');
});

server.listen(7860, () => {
    printLog.info('Health check server running on port 7860');
});