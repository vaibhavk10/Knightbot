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
const net = require('net');

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
    sock: null,
    server: null
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

// Function to check if port is in use
const isPortInUse = async (port) => {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', () => resolve(true))
            .once('listening', () => {
                server.close();
                resolve(false);
            })
            .listen(port);
    });
};

// Function to find available port
const findAvailablePort = async (startPort) => {
    let port = startPort;
    while (await isPortInUse(port)) {
        port++;
    }
    return port;
};

// Function to kill existing connections
const killExistingConnections = async () => {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => {
            // Port is in use, try to force close it
            server.close(() => resolve());
        });
        server.once('listening', () => {
            server.close(() => resolve());
        });
        server.listen(7860);
    });
};

// Automatic reconnection function
async function startConnection() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: true,
            logger,
            browser: Browsers.windows('Desktop'),
            version,
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 5000,
            defaultQueryTimeoutMs: 60000,
            emitOwnEvents: true,
            // Add WebSocket options
            ws: {
                agent: undefined,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
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
                
                if (shouldReconnect && !connectionState.isClosing) {
                    const delay = Math.min(1000 * Math.pow(2, connectionState.retryCount), 60000);
                    connectionState.retryCount++;
                    setTimeout(startConnection, delay);
                }
            }

            if (connection === 'open') {
                connectionState.isConnected = true;
                connectionState.qrDisplayed = false;
                connectionState.retryCount = 0;
                printLog.success('Connected to WhatsApp!');
                
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
}

// Initialize and start
const initialize = async () => {
    try {
        // Kill any existing connections
        await killExistingConnections();

        // Find available port
        const port = await findAvailablePort(7860);

        // Start HTTP server
        const server = http.createServer((req, res) => {
            res.writeHead(200);
            res.end('Bot is running!');
        });

        // Handle server errors
        server.on('error', (error) => {
            printLog.error('Server error:', error);
            if (error.code === 'EADDRINUSE') {
                printLog.warn('Port in use, trying another port...');
                server.close();
                initialize();
            }
        });

        // Store server reference
        connectionState.server = server;

        // Start server
        server.listen(port, '0.0.0.0', () => {
            printLog.info(`Health check server running on port ${port}`);
        });

        // Start WhatsApp connection
        await startConnection();

    } catch (error) {
        printLog.error('Initialization error:', error);
        process.exit(1);
    }
};

// Start the application
initialize().catch(error => {
    printLog.error('Fatal error during initialization:', error);
    process.exit(1);
});