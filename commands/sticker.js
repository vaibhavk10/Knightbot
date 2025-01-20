const sharp = require('sharp');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const webp = require('node-webpmux');
const crypto = require('crypto');

async function stickerCommand(sock, chatId, message) {
    let mediaMessage;

    if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedMessage = message.message.extendedTextMessage.contextInfo.quotedMessage;
        mediaMessage = quotedMessage.imageMessage || quotedMessage.videoMessage;
        message = { message: quotedMessage };
    } else {
        mediaMessage = message.message?.imageMessage || message.message?.videoMessage;
    }

    if (!mediaMessage) {
        await sock.sendMessage(chatId, { text: 'Please reply to an image or video to create a sticker, or send an image or video with the command.' });
        return;
    }

    try {
        const mediaBuffer = await downloadMediaMessage(message, 'buffer', {}, { 
            logger: undefined, 
            reuploadRequest: sock.updateMediaMessage 
        });

        if (!mediaBuffer) {
            await sock.sendMessage(chatId, { text: 'Failed to download the media. Please try again.' });
            return;
        }

        // Convert to WebP using sharp
        const webpBuffer = await sharp(mediaBuffer)
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp()
            .toBuffer();

        // Add metadata using webpmux
        const img = new webp.Image();
        await img.load(webpBuffer);

        // Create metadata using settings
        const json = {
            'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
            'sticker-pack-name': settings.packname,
            'sticker-pack-publisher': settings.author,
            'emojis': ['🤖']
        };

        // Create exif buffer
        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
        const exif = Buffer.concat([exifAttr, jsonBuffer]);
        exif.writeUIntLE(jsonBuffer.length, 14, 4);

        // Set the exif data
        img.exif = exif;

        // Get the final buffer with metadata
        const finalBuffer = await img.save(null);

        // Send the sticker
        await sock.sendMessage(chatId, {
            sticker: finalBuffer
        });

    } catch (error) {
        console.error('Error creating sticker:', error);
        await sock.sendMessage(chatId, { text: 'An error occurred while creating the sticker. Please try again.' });
    }
}

module.exports = stickerCommand;
