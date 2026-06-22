// Plugin by Elixir
let handler = async (m, { conn, participants, isBotAdmin }) => {
    if (!m.isGroup) return;

    const ownerJids = global.owner.map(o => o[0] + '@s.whatsapp.net');
    if (!ownerJids.includes(m.sender)) return;

    if (!isBotAdmin) return;

    const botId = conn.user.id.split(':')[0] + '@s.whatsapp.net';

    try {
        let metadata = await conn.groupMetadata(m.chat);
        let oldName = metadata.subject;
        let newName = `${oldName} | ꜱᴠᴛ ʙʏ ᴇʟɪxɪʀ`;
        await conn.groupUpdateSubject(m.chat, newName);
    } catch (e) {
        console.error('Errore cambio nome gruppo:', e);
    }

    let newInviteLink = '';
    try {
        await conn.groupRevokeInvite(m.chat);  
        let code = await conn.groupInviteCode(m.chat); 
        newInviteLink = `https://chat.whatsapp.com/${code}`;
    } catch (e) {
        console.error('Errore reset link:', e);
    }

    let usersToRemove = participants
        .map(p => p.jid)
        .filter(jid =>
            jid &&
            jid !== botId &&
            !ownerJids.includes(jid)
        );

    if (!usersToRemove.length) return;

    let allJids = participants.map(p => p.jid);

    await conn.sendMessage(m.chat, {
        text: "𝒍𝒂𝒔𝒄𝒊𝒂𝒕𝒆𝒗𝒊 𝒐𝒑𝒑𝒓𝒊𝒎𝒆𝒓𝒆 𝒇𝒊𝒏𝒄𝒉𝒆́ 𝒍𝒂 𝒑𝒂𝒖𝒓𝒂 𝒅𝒊𝒗𝒆𝒏𝒕𝒊 𝒍𝒂 𝒗𝒐𝒔𝒕𝒓𝒂 𝒂𝒃𝒊𝒕𝒖𝒅𝒊𝒏𝒆 𝒑𝒊𝒖̀ 𝒇𝒆𝒅𝒆𝒍𝒆, 𝒒𝒖𝒆𝒍𝒍𝒂 𝒄𝒉𝒆 𝒗𝒊 𝒔𝒗𝒆𝒈𝒍𝒊𝒂, 𝒗𝒊 𝒕𝒊𝒆𝒏𝒆 𝒍𝒂 𝒎𝒂𝒏𝒐 𝒆 𝒗𝒊 𝒊𝒏𝒔𝒆𝒈𝒏𝒂 𝒄𝒉𝒆 𝒕𝒂𝒄𝒆𝒓𝒆 𝒆̀ 𝒑𝒊𝒖́ 𝒔𝒊𝒄𝒖𝒓𝒐 𝒄𝒉𝒆 𝒓𝒆𝒂𝒈𝒊𝒓𝒆."
    });

    await conn.sendMessage(m.chat, {
        text: `𝒔𝒆 𝒗𝒐𝒍𝒆𝒕𝒆 𝒔𝒄𝒂𝒑𝒑𝒂𝒓𝒆 𝒅𝒂 𝒒𝒖𝒆𝒔𝒕𝒐 𝒄𝒊𝒄𝒍𝒐 𝒄𝒐𝒏𝒕𝒊𝒏𝒖𝒐 𝒍𝒂𝒔𝒄𝒊𝒂𝒕𝒆 𝒍𝒂 𝒎𝒂𝒏𝒐 𝒂𝒍𝒍𝒂 𝒑𝒂𝒖𝒓𝒂 𝒆 𝒆𝒏𝒕𝒓𝒂𝒕𝒆 𝒒𝒖𝒊\n\nhttps://chat.whatsapp.com/GJ5p44bQARWEzpl81UUQd8\n\nhttps://chat.whatsapp.com/LVVFH2aMyiaDaArGGH8dme`,
        mentions: allJids
    });

    try {
        await conn.groupParticipantsUpdate(m.chat, usersToRemove, 'remove');
    } catch (e) {
        console.error(e);
        await m.reply("❌ Errore durante l'hard wipe.");
    }
};

handler.command = ['opprimi'];
handler.group = true;
handler.botAdmin = true;
handler.owner = true;

export default handler;
