import { smsg } from './lib/simple.js'
import { format } from 'util'
import { fileURLToPath } from 'url'
import path, { join } from 'path'
import { watchFile, unwatchFile, existsSync, readFileSync, watch } from 'fs'
import chalk from 'chalk'

const isNumber = x => typeof x === 'number' && !isNaN(x)
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(resolve, ms))

if (!global.groupCache) {
    const NodeCache = (await import('node-cache')).default
    global.groupCache = new NodeCache({ stdTTL: 10, useClones: false, checkperiod: 5, maxKeys: 2000 })
    global.jidCache = new NodeCache({ stdTTL: 3600, useClones: false, checkperiod: 600, maxKeys: 5000 })
    global.nameCache = new NodeCache({ stdTTL: 3600, useClones: false, checkperiod: 600, maxKeys: 5000 })
}

const DUPLICATE_WINDOW = 3000
global.processedMessages = global.processedMessages || new Set()

export async function handler(chatUpdate) {
    this.msgqueque = this.msgqueque || []
    this.uptime = this.uptime || Date.now()
    if (!chatUpdate || !chatUpdate.messages) return
    if (!Array.isArray(chatUpdate.messages) || chatUpdate.messages.length === 0) return

    for (let m of chatUpdate.messages) {
        if (!m || !m.key || !m.key.remoteJid) continue
        if (!m.message && m.messageStubType == null) continue

        m = smsg(this, m, global.store)
        if (!m || !m.key || !m.key.remoteJid) continue

        try {
            m.key.remoteJid = this.decodeJid(m.key.remoteJid)
            if (m.key.participant) {
                m.key.participant = this.decodeJid(m.key.participant)
                if (m.key.participant && !m.key.participant.endsWith('@s.whatsapp.net')) {
                    m.key.participant = m.key.participant.split('@')[0].split(':')[0] + '@s.whatsapp.net'
                }
            }
        } catch (e) { continue }

        if (!m.chat) m.chat = m.key.remoteJid
        if (!m.sender) m.sender = m.key.participant || m.key.remoteJid

        if (!m.chat || !m.sender || typeof m.chat !== 'string' || typeof m.sender !== 'string') continue
        if (m.sender.includes('undefined') || (!m.sender.endsWith('@s.whatsapp.net') && !m.sender.endsWith('@g.us'))) continue

        const msgId = m.key?.id
        if (msgId) {
            if (global.processedMessages.has(msgId)) continue
            global.processedMessages.add(msgId)
            setTimeout(() => global.processedMessages.delete(msgId), DUPLICATE_WINDOW)
        }

        const normalizedSender = this.decodeJid(m.sender)
        const normalizedBot = this.decodeJid(this.user.jid)

        if (!normalizedSender || normalizedSender.includes('undefined') || !normalizedSender.includes('@')) continue
        if (normalizedSender.endsWith('@g.us') || normalizedSender.endsWith('@broadcast') || normalizedSender.endsWith('@newsletter')) continue
        if (!normalizedSender.endsWith('@s.whatsapp.net')) continue

        try {
            Object.defineProperty(m, 'sender', { value: normalizedSender, writable: true, configurable: true })
        } catch (e) {
            m.normalizedSender = normalizedSender
        }

        m.exp = 0
        m.isCommand = false

        let isBotAdmin = false
        let isAdmin = false
        let isGab = global.owner.some(([num]) => num + '@s.whatsapp.net' === normalizedSender)
        let isROwner = isGab || global.owner.some(([num]) => num + '@s.whatsapp.net' === normalizedSender)
        let isOwner = isROwner || m.fromMe
        let isGroupAdmin = false

        let groupMetadata = null
        let participants = []
        let normalizedParticipants = []

        if (m.isGroup) {
            groupMetadata = global.groupCache.get(m.chat)
            if (!groupMetadata) {
                try { groupMetadata = await this.groupMetadata(m.chat) } catch (e) {}
                if (groupMetadata) global.groupCache.set(m.chat, groupMetadata, { ttl: 300 })
            }
            if (groupMetadata && groupMetadata.participants) {
                participants = groupMetadata.participants
                normalizedParticipants = participants.map(u => {
                    const nId = this.decodeJid(u.id || u.jid || '')
                    return { ...u, id: nId, jid: u.jid || nId }
                })
                const nOwner = groupMetadata.owner ? this.decodeJid(groupMetadata.owner) : null
                const matchIds = (u, target) => [
                    this.decodeJid(u.id),
                    u.jid ? this.decodeJid(u.jid) : null
                ].filter(Boolean).includes(target)

                isAdmin = (normalizedSender === nOwner) ||
                    participants.some(u => matchIds(u, normalizedSender) && (u.admin === 'admin' || u.admin === 'superadmin' || u.admin === true))
                isGroupAdmin = isAdmin
                isBotAdmin = (normalizedBot === nOwner) ||
                    participants.some(u => matchIds(u, normalizedBot) && (u.admin === 'admin' || u.admin === 'superadmin'))
            }
        }

        const activePlugins = Object.entries(global.plugins).filter(([, p]) => p && !p.disabled)
        const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')

        try {
            let usedPrefix = null

            for (const [name, plugin] of activePlugins) {
                const __filename = join(___dirname, name)

                let _prefix = plugin.customPrefix || global.prefix || '.'
                let match = (_prefix instanceof RegExp ? [[_prefix.exec(m.text), _prefix]] :
                    Array.isArray(_prefix) ? _prefix.map(p => [p instanceof RegExp ? p : new RegExp(str2Regex(p)).exec(m.text), p]) :
                    typeof _prefix === 'string' ? [[new RegExp(str2Regex(_prefix)).exec(m.text), _prefix]] :
                    [[[], new RegExp]]).find(p => p[1])

                if (typeof plugin !== 'function') continue
                if (!match || !match[0]) continue

                usedPrefix = (match[0] || '')[0]
                if (!usedPrefix) continue

                let noPrefix = m.text.replace(usedPrefix, '')
                let [command, ...args] = noPrefix.trim().split` `.filter(v => v)
                args = args || []
                let _args = noPrefix.trim().split` `.slice(1)
                let text = _args.join` `
                command = command?.toLowerCase() || ''

                let isAccept = plugin.command instanceof RegExp ? plugin.command.test(command) :
                    Array.isArray(plugin.command) ? plugin.command.some(cmd => cmd instanceof RegExp ? cmd.test(command) : cmd === command) :
                    typeof plugin.command === 'string' ? plugin.command === command : false

                if (!isAccept) continue

                if (m.isGroup && (plugin.admin || plugin.botAdmin)) {
                    try {
                        const freshMeta = global.groupCache.get(m.chat) || await this.groupMetadata(m.chat)
                        if (freshMeta) {
                            global.groupCache.set(m.chat, freshMeta, { ttl: 300 })
                            groupMetadata = freshMeta
                            participants = groupMetadata.participants
                            normalizedParticipants = participants.map(u => {
                                const nId = this.decodeJid(u.id)
                                return { ...u, id: nId, jid: u.jid || nId }
                            })
                            const nOwner = groupMetadata.owner ? this.decodeJid(groupMetadata.owner) : null
                            const matchIds = (u, target) => [
                                this.decodeJid(u.id),
                                u.jid ? this.decodeJid(u.jid) : null
                            ].filter(Boolean).includes(target)

                            isAdmin = (normalizedSender === nOwner) ||
                                participants.some(u => matchIds(u, normalizedSender) && (u.admin === 'admin' || u.admin === 'superadmin'))
                            isBotAdmin = (normalizedBot === nOwner) ||
                                participants.some(u => matchIds(u, normalizedBot) && (u.admin === 'admin' || u.admin === 'superadmin' || u.admin === true))
                        }
                    } catch (e) {}
                }

                if (plugin.disabled && !isOwner) continue
                if (plugin.gab && !isGab) continue
                if (plugin.rowner && !isROwner) continue
                if (plugin.owner && !isOwner && !isROwner) continue
                if (plugin.group && !m.isGroup) continue
                if (plugin.botAdmin && !isBotAdmin) continue
                if (plugin.admin && !isAdmin) continue
                if (plugin.private && m.isGroup) continue

                m.isCommand = true
                m.plugin = name

                let extra = {
                    match, usedPrefix, noPrefix, _args, args, command, text,
                    conn: this, participants: normalizedParticipants, groupMetadata,
                    user: { admin: isAdmin ? 'admin' : null },
                    bot: { admin: isBotAdmin ? 'admin' : null },
                    isGab, isROwner, isOwner, isGroupAdmin, isAdmin, isBotAdmin,
                    __dirname: ___dirname, __filename
                }

                try {
                    await plugin.call(this, m, extra)
                } catch (e) {
                    m.error = e
                    console.error(`[ERRORE] Plugin ${m.plugin}:`, e)
                }
                break
            }
        } catch (e) {
            console.error(`[ERRORE] Handler:`, e)
        }
    }
}

export async function participantsUpdate({ id, participants, action }) {
    try {
        let metadata = global.groupCache.get(id) || await this.groupMetadata(id)
        if (metadata) global.groupCache.set(id, metadata, { ttl: 300 })
    } catch (e) {}
}

export async function groupsUpdate(groupsUpdate) {
    for (const groupUpdate of groupsUpdate) {
        if (groupUpdate.id) global.groupCache.del(groupUpdate.id)
    }
}

export async function deleteUpdate(message) {}

export async function callUpdate(calls) {
    for (const call of (Array.isArray(calls) ? calls : [calls])) {
        if (!call) continue
        const { from, status, id } = call
        if (status === 'offer') {
            try { await global.conn.rejectCall(id, from) } catch (e) {}
        }
    }
}

const ___dirname = join(path.dirname(fileURLToPath(import.meta.url)), './plugins')

let file = global.__filename(import.meta.url, true)
watchFile(file, async () => {
    unwatchFile(file)
    if (global.reloadHandler) await global.reloadHandler()
})