const settings = require('./settings');
const chalk = require('chalk');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const { handleMessages } = require('./main');
const { generateSessionId, saveSession, loadSession } = require('./utils');

// Global settings
global.packname = settings.packname;
global.author = settings.author;
global.channelLink = "https://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A";
global.ytch = "Mr Unique Hacker";

// Custom logger to filter unnecessary messages
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
    isClosing: false
};

async function startBot() {
    try {
        // Use existing session if SESSION_ID is provided
        if (process.env.SESSION_ID) {
            printLog.info(`Using provided session ID: ${process.env.SESSION_ID}`);
            const sessionData = await loadSession(process.env.SESSION_ID);
            if (sessionData) {
                connectionState.sessionExists = true;
                connectionState.sessionId = process.env.SESSION_ID;
            }
        }

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
        connectionState.sessionExists = state?.creds?.registered || false;

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger,
            browser: ['KnightBot', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
            qrTimeout: 40000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: true,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000,
            emitOwnEvents: true
        });

        // Save credentials with session
        sock.ev.on('creds.update', async (creds) => {
            await saveCreds();
            if (connectionState.sessionId) {
                await saveSession(connectionState.sessionId, {
                    creds,
                    sessionInfo: {
                        deviceId: sock.user?.id,
                        platform: 'KnightBot',
                        lastConnection: new Date().toISOString()
                    }
                });
                printLog.success(`Session data saved for ID: ${connectionState.sessionId}`);
            }
        });

        // Connection monitoring
        const connectionMonitor = setInterval(async () => {
            if (!connectionState.isConnected) return;
            
            try {
                await sock.sendMessage(sock.user.id, { text: '' }, { ephemeral: true })
                    .catch(() => {});
                connectionState.lastPing = Date.now();
            } catch (err) {
                if (Date.now() - connectionState.lastPing > 30000) {
                    printLog.warn('Connection check failed, attempting reconnect...');
                    clearInterval(connectionMonitor);
                    sock.end();
                }
            }
        }, 30000);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !connectionState.qrDisplayed && !connectionState.isConnected) {
                connectionState.qrDisplayed = true;
                printLog.info('Scan the QR code above to connect (Valid for 40 seconds)');
            }

            if (connection === 'close') {
                clearInterval(connectionMonitor);
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.output?.payload?.error;
                printLog.error(`Connection closed: ${reason || 'Unknown reason'}`);

                const shouldReconnect = (
                    statusCode !== DisconnectReason.loggedOut &&
                    statusCode !== DisconnectReason.badSession &&
                    connectionState.retryCount < 3
                );

                if (shouldReconnect) {
                    connectionState.retryCount++;
                    const delay = Math.min(connectionState.retryCount * 2000, 10000);
                    printLog.warn(`Reconnecting in ${delay/1000}s... (Attempt ${connectionState.retryCount}/3)`);
                    setTimeout(startBot, delay);
                } else {
                    printLog.error('Connection terminated. Please restart the bot.');
                    process.exit(1);
                }
            } else if (connection === 'open') {
                connectionState.isConnected = true;
                connectionState.qrDisplayed = false;
                connectionState.retryCount = 0;
                connectionState.lastPing = Date.now();
                
                // Generate session ID only after successful connection if not provided
                if (!connectionState.sessionId) {
                    connectionState.sessionId = generateSessionId();
                }
                printLog.success('Successfully connected to WhatsApp!');
                printLog.success(`Session ID: ${connectionState.sessionId}`);
                printLog.info('You can use this Session ID to deploy on Heroku/Hugging Face');

                try {
                    const botNumber = sock.user.id;
                    await sock.sendMessage(botNumber, {
                        text: `🎉 Bot connected successfully!\nSession ID: ${connectionState.sessionId}`
                    });
                } catch (err) {
                    // Silently handle confirmation message error
                }
            }
        });

        // Forward messages to main.js for handling
        sock.ev.on('messages.upsert', async (messageUpdate) => {
            if (connectionState.isConnected) {
                await handleMessages(sock, messageUpdate);
            }
        });

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            connectionState.isClosing = true;
            printLog.warn('\nReceived Ctrl+C');
            printLog.info('Bot will exit but keep session active');
            printLog.info('Your session and authentication will be preserved');
            clearInterval(connectionMonitor);
            process.exit(0);
        });

    } catch (err) {
        printLog.error('Error in bot initialization:', err);
        const delay = Math.min(1000 * Math.pow(2, connectionState.retryCount), 60000);
        await new Promise(resolve => setTimeout(resolve, delay));
        connectionState.retryCount++;
        startBot();
    }
}

// Start the bot
startBot();