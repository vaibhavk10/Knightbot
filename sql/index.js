const { loadUserGroupData, saveUserGroupData } = require('../utils');

// Add these functions to your SQL helper file
async function setAntilink(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antilink) data.antilink = {};
        if (!data.antilink[groupId]) data.antilink[groupId] = {};
        
        data.antilink[groupId] = {
            enabled: type === 'on',
            action: action || 'delete' // Set default action to delete
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antilink:', error);
        return false;
    }
}

async function getAntilink(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antilink || !data.antilink[groupId]) return null;
        
        return type === 'on' ? data.antilink[groupId] : null;
    } catch (error) {
        console.error('Error getting antilink:', error);
        return null;
    }
}

async function removeAntilink(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antilink && data.antilink[groupId]) {
            delete data.antilink[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antilink:', error);
        return false;
    }
}

// Add these functions for warning system
async function incrementWarningCount(groupId, userId) {
    try {
        const data = loadUserGroupData();
        if (!data.warnings) data.warnings = {};
        if (!data.warnings[groupId]) data.warnings[groupId] = {};
        if (!data.warnings[groupId][userId]) data.warnings[groupId][userId] = 0;
        
        data.warnings[groupId][userId]++;
        saveUserGroupData(data);
        return data.warnings[groupId][userId];
    } catch (error) {
        console.error('Error incrementing warning count:', error);
        return 0;
    }
}

async function resetWarningCount(groupId, userId) {
    try {
        const data = loadUserGroupData();
        if (data.warnings && data.warnings[groupId] && data.warnings[groupId][userId]) {
            data.warnings[groupId][userId] = 0;
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error resetting warning count:', error);
        return false;
    }
}

// Add sudo check function
async function isSudo(userId) {
    try {
        const data = loadUserGroupData();
        return data.sudo && data.sudo.includes(userId);
    } catch (error) {
        console.error('Error checking sudo:', error);
        return false;
    }
}

// Add these functions
async function addWelcome(jid, enabled, message) {
    try {
        const data = loadUserGroupData();
        if (!data.welcome) data.welcome = {};
        
        data.welcome[jid] = {
            enabled: enabled,
            message: message || 'Welcome {user} to the group! 🎉'
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error in addWelcome:', error);
        return false;
    }
}

async function delWelcome(jid) {
    try {
        const data = loadUserGroupData();
        if (data.welcome && data.welcome[jid]) {
            delete data.welcome[jid];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error in delWelcome:', error);
        return false;
    }
}

async function isWelcomeOn(jid) {
    try {
        const data = loadUserGroupData();
        return data.welcome && data.welcome[jid] && data.welcome[jid].enabled;
    } catch (error) {
        console.error('Error in isWelcomeOn:', error);
        return false;
    }
}

async function addGoodbye(jid, enabled, message) {
    try {
        const data = loadUserGroupData();
        if (!data.goodbye) data.goodbye = {};
        
        data.goodbye[jid] = {
            enabled: enabled,
            message: message || 'Goodbye {user} 👋'
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error in addGoodbye:', error);
        return false;
    }
}

async function delGoodBye(jid) {
    try {
        const data = loadUserGroupData();
        if (data.goodbye && data.goodbye[jid]) {
            delete data.goodbye[jid];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error in delGoodBye:', error);
        return false;
    }
}

async function isGoodByeOn(jid) {
    try {
        const data = loadUserGroupData();
        return data.goodbye && data.goodbye[jid] && data.goodbye[jid].enabled;
    } catch (error) {
        console.error('Error in isGoodByeOn:', error);
        return false;
    }
}

module.exports = {
    // ... existing exports
    setAntilink,
    getAntilink,
    removeAntilink,
    incrementWarningCount,
    resetWarningCount,
    isSudo,
    addWelcome,
    delWelcome,
    isWelcomeOn,
    addGoodbye,
    delGoodBye,
    isGoodByeOn
}; 