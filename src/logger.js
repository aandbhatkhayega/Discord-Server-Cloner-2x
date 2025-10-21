const { EmbedBuilder } = require('discord.js');
const { THEME_COLOR } = require('./ui');
const { ticketLogChannelId } = require('./config');

async function logEvent(client, title, description, fields = []) {
  try {
    if (!ticketLogChannelId) return;
    const channel = await client.channels.fetch(ticketLogChannelId);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setColor(THEME_COLOR)
      .setTitle(title)
      .setDescription(description)
      .addFields(fields)
      .setTimestamp(Date.now());
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('[logger] Failed to log event', e);
  }
}

module.exports = { logEvent };
