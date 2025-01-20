const fetch = require('node-fetch');

async function flirtCommand(sock, chatId, message, senderId) {
    try {
        // Debug logs
        console.log('Flirt command triggered');
        console.log('Chat ID:', chatId);
        console.log('Sender ID:', senderId);

        // Send typing indicator
        await sock.sendPresenceUpdate('composing', chatId);

        // Extended flirt messages
        const flirtLines = [
            // Cute & Clever
            "Are you a magician? Because whenever I look at you, everyone else disappears! ✨",
            "Do you have a map? I just keep getting lost in your eyes. 🗺️",
            "Is your name Google? Because you've got everything I've been searching for! 🔍",
            "Are you a camera? Because every time I look at you, I smile! 📸",
            "Do you have a Band-Aid? Because I just scraped my knee falling for you! 🩹",
            "Are you a parking ticket? Because you've got FINE written all over you! 🎫",
            "Is your name Wi-Fi? Because I'm really feeling a connection! 📶",
            "Do you like science? Because I've got my ion you! ⚗️",
            "Are you a bank loan? Because you've got my interest! 💰",
            "Is your dad a boxer? Because you're a knockout! 🥊",
            
            // Sweet & Romantic
            "If you were a vegetable, you'd be a cute-cumber! 🥒",
            "Are you French? Because Eiffel for you! 🗼",
            "Do you like coffee? Because I like you a latte! ☕",
            "Are you a cat? Because you're purr-fect! 😺",
            "If beauty was time, you'd be eternity! ⌛",
            "Is your name Spotify? Because you're the hottest single around! 🎵",
            "Are you a dictionary? Because you add meaning to my life! 📚",
            "Do you have a sunburn, or are you always this hot? 🔥",
            "Is this the Hogwarts Express? Because platform 9 and 3/4 isn't the only thing with a nice bump! 🚂",
            
            // Funny & Playful
            "Are you a keyboard? Because you're just my type! ⌨️",
            "Do you like Star Wars? Because Yoda one for me! 🌟",
            "Is your name Ariel? Because we mermaid for each other! 🧜‍♀️",
            "Are you a campfire? Because you're hot and I want s'more! 🏕️",
            "Do you have a name, or can I call you mine? 📞",
            "Is your dad an artist? Because you're a masterpiece! 🎨",
            "Are you a time traveler? Because I see you in my future! ⏰",
            "Do you play soccer? Because you're a keeper! ⚽",
            "Is your name Autumn? Because you're making me fall for you! 🍂",
            
            // Smooth & Charming
            "If you were a fruit, you'd be a fine-apple! 🍍",
            "Are you a cat? Because I'm feline a connection! 😸",
            "Do you have a pencil? Because I want to erase your past and write our future! ✏️",
            "Is your name Siri? Because you autocomplete me! 📱",
            "Are you a tower? Because Eiffel for you! 🗼",
            "Do you have a map? I keep getting lost in your smile! 😊",
            "Is this the library? Because I'm checking you out! 📚",
            "Are you a keyboard? Because you're my type! ⌨️",
            "Do you believe in love at first sight, or should I walk by again? 👣",
            
            // Nerdy & Geeky
            "Are you a computer? Because you've turned my life from a 0 to a 1! 💻",
            "Do you have 11 protons? Because you're sodium fine! ⚛️",
            "Is your name JavaScript? Because you make my heart function! 💝",
            "Are you a planet? Because you've got my world revolving around you! 🌍",
            "Do you have a name or can I call you TCP because I'd like to establish a connection! 🔌",
            "Is your name RAM? Because you're always on my memory! 💾",
            "Are you a keyboard? Because you're just my type! ⌨️",
            "Do you like math? Because I'd like to add you to my life! ➕"
        ];

        // Get random flirt message
        const flirtMsg = `\n${pickRandom(flirtLines)}`;

        // Send message
        const messageToSend = {
            text: flirtMsg,
            mentions: [senderId],
            quoted: message,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: false
            }
        };

        console.log('Sending message:', messageToSend);

        await sock.sendMessage(chatId, messageToSend);
        console.log('Message sent successfully');

    } catch (error) {
        console.error('Error in flirt command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to send flirt message. Please try again.',
            quoted: message
        });
    }
}

// Helper function to pick random item from list
function pickRandom(list) {
    return list[Math.floor(list.length * Math.random())];
}

module.exports = flirtCommand; 