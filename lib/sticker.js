const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { fileTypeFromBuffer } = require('file-type')
const webp = require('node-webpmux')
const fetch = require('node-fetch')
const ffmpeg = require('fluent-ffmpeg')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

const tmp = path.join(__dirname, '../tmp')

/**
 * Image to Sticker
 * @param {Buffer} img Image Buffer
 * @param {String} url Image URL
 */
function sticker2(img, url) {
  return new Promise(async (resolve, reject) => {
    try {
      if (url) {
        let res = await fetch(url)
        if (res.status !== 200) throw await res.text()
        img = await res.buffer()
      }
      let inp = path.join(tmp, +new Date + '.jpeg')
      await fs.promises.writeFile(inp, img)
      let ff = spawn('ffmpeg', [
        '-y',
        '-i', inp,
        '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1',
        '-f', 'png',
        '-'
      ])
      ff.on('error', reject)
      ff.on('close', async () => {
        await fs.promises.unlink(inp)
      })
      let bufs = []
      const [_spawnprocess, ..._spawnargs] = [...(module.exports.support.gm ? ['gm'] : module.exports.magick ? ['magick'] : []), 'convert', 'png:-', 'webp:-']
      let im = spawn(_spawnprocess, _spawnargs)
      im.on('error', e => conn.reply(m.chat, util.format(e), m))
      im.stdout.on('data', chunk => bufs.push(chunk))
      ff.stdout.pipe(im.stdin)
      im.on('exit', () => {
        resolve(Buffer.concat(bufs))
      })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Image/Video to Sticker
 * @param {Buffer} img Image/Video Buffer
 * @param {String} url Image/Video URL
 * @param {String} packname EXIF Packname
 * @param {String} author EXIF Author
 */
async function sticker3(img, url, packname, author) {
  url = url ? url : await uploadFile(img)
  let res = await fetch('https://api.xteam.xyz/sticker/wm?' + new URLSearchParams(Object.entries({
    url,
    packname,
    author
  })))
  return await res.buffer()
}

/**
 * Image to Sticker
 * @param {Buffer} img Image/Video Buffer
 * @param {String} url Image/Video URL
 */
async function sticker4(img, url) {
  if (url) {
    let res = await fetch(url)
    if (res.status !== 200) throw await res.text()
    img = await res.buffer()
  }
  return await ffmpeg(img, [
    '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1'
  ], 'jpeg', 'webp')
}

async function sticker5(img, url, packname, author, categories = [''], extra = {}) {
  const { Sticker } = await import('wa-sticker-formatter')
  const stickerMetadata = {
    type: 'default',
    pack: packname,
    author,
    categories,
    ...extra
  }
  return (new Sticker(img ? img : url, stickerMetadata)).toBuffer()
}

/**
 * Convert using fluent-ffmpeg
 * @param {string} img 
 * @param {string} url 
 */
function sticker6(img, url) {
  return new Promise(async (resolve, reject) => {
    if (url) {
      let res = await fetch(url)
      if (res.status !== 200) throw await res.text()
      img = await res.buffer()
    }
    const type = await fileTypeFromBuffer(img) || {
      mime: 'application/octet-stream',
      ext: 'bin'
    }
    if (type.ext == 'bin') reject(img)
    const tmp = path.join(__dirname, `../tmp/${+ new Date()}.${type.ext}`)
    const out = path.join(tmp + '.webp')
    await fs.promises.writeFile(tmp, img)
    // https://github.com/MhankBarBar/termux-wabot/blob/main/index.js#L313#L368
    let Fffmpeg = /video/i.test(type.mime) ? fluent_ffmpeg(tmp).inputFormat(type.ext) : fluent_ffmpeg(tmp).input(tmp)
    Fffmpeg
      .on('error', function (err) {
        console.error(err)
        fs.promises.unlink(tmp)
        reject(img)
      })
      .on('end', async function () {
        fs.promises.unlink(tmp)
        resolve(await fs.promises.readFile(out))
      })
      .addOutputOptions([
        `-vcodec`, `libwebp`, `-vf`,
        `scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`
      ])
      .toFormat('webp')
      .save(out)
  })
}
/**
 * Add WhatsApp JSON Exif Metadata
 * Taken from https://github.com/pedroslopez/whatsapp-web.js/pull/527/files
 * @param {Buffer} webpSticker 
 * @param {String} packname 
 * @param {String} author 
 * @param {String} categories 
 * @param {Object} extra 
 * @returns 
 */
async function addExif(webpSticker, packname, author, categories = [''], extra = {}) {
  const img = new webp.Image();
  const stickerPackId = crypto.randomBytes(32).toString('hex');
  const json = { 'sticker-pack-id': stickerPackId, 'sticker-pack-name': packname, 'sticker-pack-publisher': author, 'emojis': categories, ...extra };
  let exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  let exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);
  await img.load(webpSticker)
  img.exif = exif
  return await img.save(null)
}

/**
 * Convert media to WebP and add metadata
 * @param {Buffer} inputBuffer Image Buffer
 * @param {String} url Image URL
 * @param {String} packname EXIF Packname
 * @param {String} author EXIF Author
 */
async function sticker(inputBuffer, url, packname = 'KnightBot', author = 'Bot') {
  try {
    let mediaData = inputBuffer;
    if (url) {
      let res = await fetch(url);
      if (res.status !== 200) throw await res.text();
      mediaData = await res.buffer();
    }

    // Ensure tmp directory exists
    if (!fs.existsSync(tmp)) {
      fs.mkdirSync(tmp, { recursive: true });
    }

    const inputPath = path.join(tmp, `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);
    const outputPath = path.join(tmp, `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);

    // Write input file
    await fs.promises.writeFile(inputPath, mediaData);

    // Convert to WebP using ffmpeg
    const ffmpegCommand = `ffmpeg -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1" -f webp "${outputPath}"`;
    
    await execAsync(ffmpegCommand);

    // Read the converted file
    const webpBuffer = await fs.promises.readFile(outputPath);

    // Add metadata
    const webpImage = new webp.Image();
    const json = {
      'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
      'sticker-pack-name': packname,
      'sticker-pack-publisher': author,
    };

    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);

    await webpImage.load(webpBuffer);
    webpImage.exif = exif;

    // Clean up temporary files
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
    } catch (err) {
      console.error('Error cleaning up temp files:', err);
    }

    return await webpImage.save(null);

  } catch (error) {
    console.error('Error in sticker creation:', error);
    return null;
  }
}

const support = {
  ffmpeg: true,
  ffprobe: true,
  ffmpegWebp: true,
  convert: true,
  magick: false,
  gm: false,
  find: false
}

module.exports = {
  sticker,
  sticker2,
  sticker3,
  sticker4,
  sticker6,
  addExif,
  support
}