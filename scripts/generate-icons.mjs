import sharp from 'sharp'
import { mkdir, readFile } from 'node:fs/promises'
await mkdir('public/icons', { recursive: true })
const svg = await readFile('public/favicon.svg')
for (const size of [192, 512]) await sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`)
const inset = await sharp(svg).resize(320, 320).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#304d43' } }).composite([{ input: inset, gravity: 'center' }]).png().toFile('public/icons/maskable-512.png')
