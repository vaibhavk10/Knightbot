const settings = require('./settings');
const chalk = require('chalk');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const { handleMessages } = require('./main');
const { generateSessionId } = require('./utils');
const NodeCache = require('node-cache');
const EventEmitter = require('events');
const http = require('http');
const msgRetryCounterCache = new NodeCache();

// Increase event listener limit
EventEmitter.defaultMaxListeners = 2000;
process.setMaxListeners(2000);

// Global settings
global.packname = settings.packname;
global.author = settings.author;

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
    sessionId: process.env.SESSION_ID || null,
    isClosing: false,
    sock: null
};

const sessionPath = './session';

// Start connection
const startConnection = async () => {
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
            msgRetryCounterCache
        });

        connectionState.sock = sock;

        // Connection update handler
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
            }
        });

        // Credentials update handler
        sock.ev.on('creds.update', saveCreds);

        // Message handler
        sock.ev.on('messages.upsert', async (messageUpdate) => {
            if (connectionState.isConnected) {
                try {
                    await handleMessages(sock, messageUpdate);
                } catch (error) {
                    console.error('Error in message handler:', error);
                }
            }
        });

    } catch (err) {
        printLog.error('Connection error:', err);
        if (!connectionState.isClosing) {
            const delay = Math.min(1000 * Math.pow(2, connectionState.retryCount), 60000);
            connectionState.retryCount++;
            setTimeout(startConnection, delay);
        }
    }
};

// Initialize and start
const initialize = async () => {
    try {
        await startConnection();
        
        const server = http.createServer((req, res) => {
            res.writeHead(200);
            res.end('Bot is running!');
        });

        server.listen(7860, '0.0.0.0', () => {
            printLog.info('Health check server running on port 7860');
        });
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