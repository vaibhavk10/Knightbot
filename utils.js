const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Session management
function generateSessionId(prefix = 'KnightBot') {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
}

async function encryptSession(data) {
    try {
        const key = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        
        let encrypted = cipher.update(JSON.stringify(data));
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        return {
            key: key.toString('hex'),
            iv: iv.toString('hex'),
            data: encrypted.toString('hex')
        };
    } catch (error) {
        console.error('Encryption error:', error);
        return null;
    }
}

async function decryptSession(encrypted) {
    try {
        const key = Buffer.from(encrypted.key, 'hex');
        const iv = Buffer.from(encrypted.iv, 'hex');
        const encryptedData = Buffer.from(encrypted.data, 'hex');
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return JSON.parse(decrypted.toString());
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

async function saveSession(sessionId, authData) {
    try {
        const sessionsDir = path.join(__dirname, 'sessions');
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }

        // Create backup of existing session if it exists
        const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
        if (fs.existsSync(sessionFile)) {
            const backupFile = path.join(sessionsDir, `${sessionId}.backup.json`);
            fs.copyFileSync(sessionFile, backupFile);
        }

        // Encrypt and save new session
        const encrypted = await encryptSession(authData);
        if (!encrypted) throw new Error('Failed to encrypt session data');

        // Write to temporary file first
        const tempFile = path.join(sessionsDir, `${sessionId}.temp.json`);
        fs.writeFileSync(tempFile, JSON.stringify(encrypted, null, 2));

        // Rename temp file to actual file (atomic operation)
        fs.renameSync(tempFile, sessionFile);

        // Create creds file with metadata
        const credsFile = path.join(sessionsDir, `${sessionId}.creds.json`);
        fs.writeFileSync(credsFile, JSON.stringify({
            id: sessionId,
            created: Date.now(),
            platform: process.platform,
            version: '1.0.0',
            lastUpdate: Date.now()
        }, null, 2));

        return true;
    } catch (error) {
        console.error('Error saving session:', error);
        return false;
    }
}

async function loadSession(sessionId) {
    try {
        const sessionFile = path.join(__dirname, 'sessions', `${sessionId}.json`);
        const backupFile = path.join(__dirname, 'sessions', `${sessionId}.backup.json`);

        // Try loading main file first
        if (fs.existsSync(sessionFile)) {
            const encrypted = JSON.parse(fs.readFileSync(sessionFile));
            const decrypted = await decryptSession(encrypted);
            if (decrypted) return decrypted;
        }

        // If main file fails, try backup
        if (fs.existsSync(backupFile)) {
            const encrypted = JSON.parse(fs.readFileSync(backupFile));
            const decrypted = await decryptSession(encrypted);
            if (decrypted) {
                // Restore backup to main file
                fs.copyFileSync(backupFile, sessionFile);
                return decrypted;
            }
        }

        return null;
    } catch (error) {
        console.error('Error loading session:', error);
        return null;
    }
}

function getSessionInfo(sessionId) {
    try {
        const credsFile = path.join(__dirname, 'sessions', `${sessionId}.creds.json`);
        if (fs.existsSync(credsFile)) {
            return JSON.parse(fs.readFileSync(credsFile));
        }
        return null;
    } catch (error) {
        console.error('Error getting session info:', error);
        return null;
    }
}

// Load all commands from the commands directory
function loadCommands() {
    const commands = new Map();
    const commandsPath = path.join(__dirname, 'commands');
    
    try {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            // Use the filename without extension as the command name
            const commandName = file.split('.')[0];
            commands.set(commandName, command);
        }
        
        return commands;
    } catch (error) {
        console.error('Error loading commands:', error);
        return new Map();
    }
}

// Database operations
const dataFile = path.join(__dirname, './data/userGroupData.json');

function loadUserGroupData() {
    try {
        if (fs.existsSync(dataFile)) {
            return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
        }
        return { users: [], groups: [] };
    } catch (error) {
        console.error('Error loading user group data:', error);
        return { users: [], groups: [] };
    }
}

function saveUserGroupData(data) {
    try {
        const dir = path.dirname(dataFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving user group data:', error);
        return false;
    }
}

module.exports = {
    loadCommands,
    loadUserGroupData,
    saveUserGroupData,
    generateSessionId,
    saveSession,
    loadSession,
    getSessionInfo
};